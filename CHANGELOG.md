# 更改记录

本文件记录 DestinyDraw 彩票助手的所有版本变更。

---

## v1.12 — 2026-04-28

### 修复
- **Logo 透明通道**：将首页 Logo 替换为带 Alpha 透明通道的 PNG 格式，彻底消除白色矩形边框
- 移除针对白底图片的 CSS 处理技巧（`mix-blend-mode: multiply`、`contrast()` 滤镜），避免颜色失真

---

## v1.11 — 2026-04-28

### 新增
- **DestinyDraw Logo**：首页标题由纯文字替换为品牌 Logo 图片
- **Logo 动效**：
  - 入场弹出动画（页面加载时从下方弹入，带弹性过冲曲线）
  - 上下浮动效果（每 5 秒轻微漂浮 + 微角度摇晃，模拟悬浮水晶）
  - 紫粉光晕呼吸（每 3.8 秒循环由暗到亮的霓虹光晕脉冲）
  - 扫光高亮（每 5 秒一道白色光线从左至右掠过，模拟宝石折射）
- **版本号标签**：Logo 右下角显示当前版本号 `v1.11`

### 代码优化
- **JS 清理**（净减少约 100 行）：
  - 删除从未调用的 `renderPlaceholderContent` 函数（约 18 行）
  - 删除从未调用的 `renderQuickResults` 函数（约 70 行）
  - 提取 `.model-note` 为模块级缓存常量，消除 `openSubpage` / `goHome` 中的重复 `querySelector` 调用
  - 移除 `openSubpage` 中的死分支 `else`
- **CSS 清理**（净减少约 130 行）：
  - 移除 11 处未使用的 CSS 类：`.subpage-kicker`、`.preview-meta`、`.preview-label`、`.receipt-*` 系列、`.mc-picker-section`、`.vallog-trigger` 等

---

## v1.10 — 2026-04-27

### 新增
- 添加 `.gitignore`，忽略运行日志及临时文件

### 基础设施
- 接入 **GitHub Actions** 自动定时更新彩票历史数据（双色球 / 大乐透 / 快乐 8）
- 数据文件（`data/ssq.json`、`data/dlt.json`、`data/k8.json`）随每次开奖后自动刷新

---

## v1.9 — 2026-04-26

### 新增
- **自动选号功能**：双色球 / 大乐透 / 快乐 8 均支持按策略自动分析推荐号码
- **数据抓取脚本**：`scripts/fetch-data.ps1`、`scripts/update-data.py` 用于本地拉取历史开奖数据

---

## v1.8 — 2026-04-26

### 优化
- 统一切换为**小票风格**结果展示 UI（`slip-wrapper` 样式体系）
- 新增完整 CSS 样式规范

### 修复
- 数据拉取脚本切换为 PowerShell 实现，增加本地文件兜底逻辑

---

## v1.7 — 2026-04-25

### 优化
- 整体界面视觉升级：多色渐变背景、导航卡片磨砂玻璃风格
- 基础 JS 逻辑重构，提升交互响应性

---

## v1.0 — 初始版本

### 新增
- 项目初始化，建立基础 HTML / CSS / JS 文件结构
- 首页导航网格：10 个功能入口（机选 / 自动选号 / 错过计算 / 人生模拟 / 历史验证 / 空号校验）
- 安全随机数：使用 `crypto.getRandomValues` 替代 `Math.random`
- 本地持久化：`localStorage` 保存导航卡片顺序、选号配置、验证日志
- 拖拽排序：首页导航卡片支持长按拖拽重新排序，刷新后保持布局
