"""
彩票数据库增量更新脚本
=======================
每次运行时从网络抓取最新数据，与本地 JSON 合并去重后写回。
数据源：
  双色球 → datachart.500.com 静态PHP
  大乐透 → datachart.500.com 静态PHP
  快乐8  → data.917500.cn/kl81000_cq_asc.txt

用法：
  python update-data.py              # 更新全部三个
  python update-data.py ssq          # 只更新双色球
  python update-data.py dlt k8       # 只更新大乐透和快乐8
"""

import re
import sys
import json
import time
import requests
import os
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup

# ── 路径配置 ──────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
DATA_DIR   = SCRIPT_DIR.parent / "data"
LOG_FILE   = SCRIPT_DIR / "update.log"

# ── 日期辅助 ──────────────────────────────────────────────
WEEKDAY_CN = ["一", "二", "三", "四", "五", "六", "日"]

def fmt_date(raw: str) -> str:
    raw = str(raw).strip().split(" ")[0].replace("/", "-")
    if re.match(r"^\d{8}$", raw):
        raw = f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
    try:
        dt = datetime.strptime(raw[:10], "%Y-%m-%d")
        return f"{raw[:10]}({WEEKDAY_CN[dt.weekday()]})"
    except Exception:
        return raw

def pad(num) -> str:
    s = re.sub(r"[^\d]", "", str(num).strip())
    return s.zfill(2) if s else ""

def normalize_code(raw: str) -> str:
    """将网站返回的期号统一为 7 位格式（YYYYNNN）。
    网站格式 YYNNN(5位) → 本地格式 20YYNNN(7位)。"""
    raw = raw.strip()
    if len(raw) == 5 and re.match(r"^\d{5}$", raw):
        return "20" + raw
    return raw

# ── 通用请求头 ─────────────────────────────────────────────
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "zh-CN,zh;q=0.9",
}

def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

# ── 加载本地 JSON ──────────────────────────────────────────
def load_local(game: str) -> dict:
    path = DATA_DIR / f"{game}.json"
    if not path.exists():
        return {"draws": [], "updatedAt": 0}
    for enc in ("utf-8-sig", "utf-8", "gbk"):
        try:
            with open(path, "r", encoding=enc) as f:
                return json.load(f)
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
        except Exception as e:
            log(f"  ⚠️  读取 {game}.json 失败: {e}")
            return {"draws": [], "updatedAt": 0}
    log(f"  ⚠️  {game}.json 编码无法识别，将从空开始")
    return {"draws": [], "updatedAt": 0}

# ── 保存到本地 JSON ────────────────────────────────────────
def save_local(game: str, draws: list):
    path = DATA_DIR / f"{game}.json"
    data = {
        "draws": draws,
        "updatedAt": int(datetime.now().timestamp() * 1000)
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    log(f"  💾 {game}.json 已保存 → {len(draws)} 期")

# ── 合并去重（以 code 为 key，远端数据优先覆盖） ──────────
def merge(existing: list, fetched: list) -> list:
    m = {d["code"]: d for d in existing}
    for d in fetched:
        m[d["code"]] = d
    return sorted(m.values(), key=lambda x: int(x["code"]), reverse=True)

# ── 500彩票 HTML 请求 ──────────────────────────────────────
def fetch_500_html(url: str) -> BeautifulSoup:
    for attempt in range(1, 4):
        try:
            resp = requests.get(
                url,
                headers={**HEADERS, "Referer": "https://datachart.500.com/"},
                timeout=30
            )
            resp.raise_for_status()
            resp.encoding = "gb2312"
            return BeautifulSoup(resp.text, "html.parser")
        except Exception as e:
            log(f"    第{attempt}次请求失败: {e}")
            if attempt < 3:
                time.sleep(3)
    return None

# ── 双色球抓取 ─────────────────────────────────────────────
def fetch_ssq() -> list:
    log("[双色球] 开始抓取...")
    url = "https://datachart.500.com/ssq/history/newinc/history.php?start=00001&end=99999"
    soup = fetch_500_html(url)
    if not soup:
        log("  ❌ 请求失败")
        return []

    tbody = soup.find("tbody", id="tdata") or soup.find("tbody")
    if not tbody:
        log("  ❌ 未找到数据表格")
        return []

    draws = []
    for tr in tbody.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 8:
            continue
        try:
            code = normalize_code(tds[0].get_text(strip=True))
            if not re.match(r"^\d+$", code):
                continue
            reds = sorted([int(pad(tds[i].get_text(strip=True))) for i in range(1, 7)])
            blue = int(pad(tds[7].get_text(strip=True)))
            date_str = ""
            for td in reversed(tds):
                txt = td.get_text(strip=True)
                if re.match(r"\d{4}-\d{2}-\d{2}", txt):
                    date_str = txt[:10]
                    break
            if not all(reds) or not blue:
                continue
            draws.append({
                "code": code,
                "date": fmt_date(date_str),
                "red":  reds,
                "blue": [blue]
            })
        except Exception:
            continue

    log(f"  ✅ 抓取到 {len(draws)} 条")
    return draws

# ── 大乐透抓取 ─────────────────────────────────────────────
def fetch_dlt() -> list:
    log("[大乐透] 开始抓取...")
    url = "https://datachart.500.com/dlt/history/newinc/history.php?start=00001&end=99999"
    soup = fetch_500_html(url)
    if not soup:
        log("  ❌ 请求失败")
        return []

    tbody = soup.find("tbody", id="tdata") or soup.find("tbody")
    if not tbody:
        log("  ❌ 未找到数据表格")
        return []

    draws = []
    for tr in tbody.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 8:
            continue
        try:
            code = normalize_code(tds[0].get_text(strip=True))
            if not re.match(r"^\d+$", code):
                continue
            front = sorted([int(pad(tds[i].get_text(strip=True))) for i in range(1, 6)])
            back  = sorted([int(pad(tds[i].get_text(strip=True))) for i in range(6, 8)])
            date_str = ""
            for td in reversed(tds):
                txt = td.get_text(strip=True)
                if re.match(r"\d{4}-\d{2}-\d{2}", txt):
                    date_str = txt[:10]
                    break
            if not all(front) or not all(back):
                continue
            draws.append({
                "code": code,
                "date": fmt_date(date_str),
                "red":  front,
                "blue": back
            })
        except Exception:
            continue

    log(f"  ✅ 抓取到 {len(draws)} 条")
    return draws

# ── 快乐8抓取 ──────────────────────────────────────────────
def fetch_k8() -> list:
    log("[快乐8] 开始抓取...")
    url = "https://data.917500.cn/kl81000_cq_asc.txt"
    for attempt in range(1, 4):
        try:
            resp = requests.get(
                url,
                headers={**HEADERS, "Referer": "https://www.917500.cn/"},
                timeout=30
            )
            resp.raise_for_status()
            text = resp.content.decode("utf-8", errors="ignore")
            break
        except Exception as e:
            log(f"    第{attempt}次请求失败: {e}")
            if attempt < 3:
                time.sleep(3)
    else:
        log("  ❌ 请求全部失败")
        return []

    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    draws = []
    for line in lines:
        parts = line.split()
        if len(parts) < 22:
            continue
        try:
            code     = normalize_code(parts[0])
            date_raw = parts[1]
            nums_raw = parts[2:22]
            nums = sorted([int(pad(n)) for n in nums_raw if re.match(r"^\d+$", n)])
            if len(nums) < 20:
                continue
            draws.append({
                "code": code,
                "date": fmt_date(date_raw),
                "red":  nums
            })
        except Exception:
            continue

    # txt 是升序，翻转为降序
    draws.reverse()
    log(f"  ✅ 抓取到 {len(draws)} 条")
    return draws

# ── 更新单个彩种 ───────────────────────────────────────────
FETCHERS = {"ssq": fetch_ssq, "dlt": fetch_dlt, "k8": fetch_k8}

def update_game(game: str):
    local  = load_local(game)
    old_count = len(local.get("draws", []))
    newest_local = local["draws"][0]["code"] if local.get("draws") else "无"

    fetched = FETCHERS[game]()
    if not fetched:
        log(f"  ⚠️  {game} 抓取为空，跳过更新")
        return

    merged = merge(local.get("draws", []), fetched)
    new_count = len(merged)
    newest_merged = merged[0]["code"] if merged else "无"

    added = new_count - old_count
    log(f"  📊 {game}: 原 {old_count} 期 + 新增 {max(0,added)} 期 = 共 {new_count} 期 (最新={newest_merged})")
    save_local(game, merged)

# ── 主入口 ─────────────────────────────────────────────────
if __name__ == "__main__":
    games = sys.argv[1:] if len(sys.argv) > 1 else ["ssq", "dlt", "k8"]
    invalid = [g for g in games if g not in FETCHERS]
    if invalid:
        print(f"未知彩种: {invalid}，可选: ssq / dlt / k8")
        sys.exit(1)

    log("=" * 60)
    log(f"开始更新: {', '.join(games)}")
    log("=" * 60)

    for game in games:
        update_game(game)

    log("=" * 60)
    log("全部更新完成")
    log("=" * 60)
