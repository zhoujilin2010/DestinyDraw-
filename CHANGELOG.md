# 更改记录

本文件记录 DestinyDraw 彩票助手的所有版本变更。

---

## v1.24 — 2026-05-18

### 奇偶比/大小比改为后置筛选

**问题**：奇偶比和大小比被当作抽号时的硬约束，三个生成函数（单式/复式/胆拖）在抽号过程中强制满足这些比例，导致单式生成逻辑走偏。

**修复**：将奇偶比和大小比从"生成时约束"改为"后置筛选条件"。

- **简化生成函数**：`generateSingleTicket` / `generateMultipleTicket` / `generateDanTuoTicket` 移除所有 `pickOddEvenRatio` / `pickBigSmallRatio` / 约束式抽号逻辑，始终自由随机抽取（仅受杀号球池限制）
- **新增** `validateTicketRatios(ticket, game)` 后置验证函数：检查生成结果的红球奇偶比和大小比是否命中用户选项（支持多选/对称覆盖）
- **新增** `AUTO_RATIO_RETRY_LIMIT` = 50：每注最多重试 50 次直到通过筛选
- **修改** `handleGenerateQuick`：每注生成后调用 `validateTicketRatios` 验证，不通过则重新生成
- **UI 文案**：奇偶比/大小比标题从"控制"改为"筛选"，提示改为"生成后自动验证，不符合则重新生成"
- **代码量**：净减 104 行（+58/-162）

### 新流程

```
每注号码:
  do:
    自由随机抽取（仅受杀号球池限制）
    相似度差异化检查（组间不重复）
  while (奇偶比/大小比不匹配 && 重试<50次)
  → 入结果集
```

---

## v1.23 — 2026-05-17

### 代码审查与增量优化

在 v1.22 代码质量优化的基础上进一步审查和清理：

- **数据更新**：运行 `update-data.py` 确保历史数据完整
- **移除失效 CI**：清理已失效的 GitHub Actions workflow
- **DOM 安全加固**：继续推进 innerHTML 替换为 DOM API
- **README 同步**：更新文档与实际状态一致

---

## v1.22 — 2026-05-17

### 代码质量优化（基于 v1.21 审查报告）

#### Toast 通知系统
- **新增** `showToast()` 函数，支持 success / error / info / warning 四种类型
- **替换** 全部 5 处 `alert()` 调用为 toast 通知（导出无记录、导入格式错误、导入成功、解析失败、策略更新）
- **新增** toast CSS 样式：右上角定位、玻璃态效果、入场/退场动画、移动端适配

#### Web Worker 独立化
- **提取** 人生模拟器 Worker 代码（~170 行）到独立的 `worker.js` 文件
- **移除** 内联 `LIFE_SIM_WORKER_SRC` 模板字符串
- Worker 创建从 Blob URL 改为文件引用 `new Worker('./worker.js')`

#### 内联样式清理
- **新增** `.color-dan` / `.color-tuo` CSS 类（胆码琥珀色/拖码电蓝色）
- **替换** `renderLifeSimPage` 和 `renderMissPage` 中的硬编码 `style="color:#f59e0b"` / `style="color:#3b82f6"`

#### innerHTML → DOM API
- **新增** `domEl()` / `setText()` 安全 DOM 创建助手函数
- **替换** 6 处关键路径 innerHTML 为 DOM API 创建（`renderQuickPicker`、`renderReceiptResults`、`renderQuickPage` 等）
- 更新 README 目录结构，添加 `worker.js` 说明

---

## v1.21 — 2026-05-16

### 清理失效脚本与 Workflow

移除三个已失效的数据抓取脚本及其关联的 GitHub Actions workflow，同步更新文档。

...

### 修正 K8 蒙特卡洛校验 UI 文字（20球）

v1.19 已修复代码层（空号校验生成 20 球、自动选号杀号组生成 20 球），但 UI 描述文字仍残留"选十"、"10个号"等过时描述，现统一修正：

- **空号校验工具（蒙特卡洛）**：页面描述、结果卡片、解读文本中所有"选十"、"每注10球"、"10个号码"改为"20球"或"与开奖球数一致"
- **K8 自动选号**：步骤1描述"每组从1-80中摇出10个号"→"20个号"
- 仅涉及文字层，代码逻辑无变更（代码自 v1.19 起已正确生成 20 球）

#### 验证确认
- `runManualCheck` 第4833行：`simulatePhysicalDrawFromPool(pool, 20)` ✅ 已为20球
- `handleK8AutoStart` 第3978行：`simulatePhysicalDraw(20, 80)` ✅ 已为20球
- **历史验证器**（`validator` 页面）保留"选十10球"不变，因为该工具是用户手动输入 10 个号码做验证

#### 已删除
- **`scripts/fetch-data.js`**：Node.js 抓取脚本，调用的 cwl.gov.cn / sporttery.cn API 已被 WAF 拦截（302 无限重定向 / 403 禁止 / E0001 请求错误），实际已无法使用
- **`scripts/fetch-data.ps1`**：PowerShell 版本，相同的数据源，相同的反爬拦截问题
- **`.github/workflows/fetch-lottery-data.yml`**：对应的 GitHub Actions workflow，每天 UTC 17:00 运行已失效的 PowerShell 脚本

#### 已更新
- **README.md**：目录结构移除 `fetch-data.ps1`，手动更新命令改为 Python 脚本
- **`update-data.py` 为唯一推荐通道**：数据源为 datachart.500.com 和 data.917500.cn（可正常访问），有合并去重逻辑，不会覆盖丢失历史数据

#### 数据恢复
- 运行 `update-data.py` 将数据文件恢复为完整历史：SSQ 3451 期 / DLT 2870 期 / K8 1232 期

---

## v1.20 — 2026-05-16

### 二级页面深色主题统一优化

将所有二级页面（机选、自动选号、人生模拟器、错过查询、历史验证器、空号校验等）的样式从原本的亮色/混搭主题全面统一为首页的深色科技风主题，确保全站视觉一致性。

#### 字体统一
- **标题字体**：全部二级页面标题统一使用 `Funnel Display`（与首页一致）
- **正文字体**：统一使用 `Inter Tight`
- **等宽字体**：数字、代码、技术标签统一使用 `Geist Mono`（替代以往的 `Courier New`）
- 移除所有 `font-family: inherit` 的继承用法，显式指定字体层级

#### 色彩体系
- **卡片/面板背景**：从 `#faf9f7`、`#ffffff`、`#f7f7fd` 等亮色改为 `rgba(26,26,26,0.95)` 半透明深色，搭配 `rgba(16,185,129,0.12)` 翠绿描边
- **输入框**：从白色背景改为 `var(--bg-tertiary)` + `var(--border-light)` 样式，聚焦时显示翠绿光晕
- **数字选择球**：从白色球改为深色 `var(--bg-surface)` 背景，红/蓝/绿激活态改为发光径向渐变
- **错误/提示横幅**：从粉白/蓝白亮色改为带透明度的深色变体（`rgba(239,68,68,0.08)` 等）
- **文字颜色**：从硬编码 `#333`、`#888`、`#aaaacc` 等统一为 `var(--text-primary/secondary/tertiary)` 变量体系
- **按钮色调**：生成/确认/复制等操作按钮统一为翠绿渐变 `linear-gradient(135deg, #10b981, #047857)`

#### 具体组件修改

**机选页面 (quick-builder)**
- `config-card`、`picker-card`：亮色→深色，添加微阴影
- `field-input`：白底→深色，Geist Mono 字体
- `pick-chip`：白底→深色，hover 放大+翠绿边框，激活态径向渐变发光
- `error-banner`：粉红→深色透明红背景
- `generate-btn`：纯黑→翠绿渐变，Geist Mono 字体

**自动选号页面 (auto-step-card)**
- `auto-step-card`：亮色→深色渐变
- `auto-kill-group-row`：白底→深色，杀号组红底改为透明红
- `auto-mode-note`：蓝底→透明翠绿底
- `killed-summary`：粉红底→透明红底
- `k8-fold-btn`：浅色→深色透明边框
- `auto-start-btn`/`auto-confirm-btn`：纯黑→翠绿渐变

**人生模拟器 (ls-*)**
- `ls-wrap`：纯白→深色渐变，翠绿网格装饰线
- `ls-config-area`、`ls-info-bar`：亮灰→深色
- `ls-tab`：亮灰→深色，激活态翠绿描边
- `ls-number-input`：白底→深色
- `ls-ball`：亮灰→深色，激活态发光径向渐变
- `ls-start-btn`：紫蓝渐变→翠绿渐变
- `ls-result-card`、`ls-comment`：亮灰→深色
- `ls-result-card-main` 颜色值调整为深色兼容（`#00aa55`→`#34d399` 等）
- `ls-loss-amount`、`ls-profit-amount`：调整为深色主题亮色

**错过查询页面 (miss-*)**
- `miss-tab`：圆角胶囊→直角，亮色→深色，激活态翠绿
- `miss-table-wrap`、`miss-detail-wrap`：亮灰→深色
- `miss-ball`：浅色→深色透明背景，命中态发光
- `miss-prize-badge` level 5-7：浅色→深色透明
- `miss-error-tip`：亮灰→深色

**K8 选法 (k8-mode-*)**
- `k8-mode-tab`：圆角浅色→直角深色，激活态翠绿

**选号单 (slip-*)**
- `slip-wrapper`：浅色→深色
- `slip-header`、`slip-footer`：浅色→深色
- `slip-copy-btn`：黑灰→翠绿渐变
- 杀号组行：浅粉红→透明红

**验证器 (validator-*)**
- `validator-section-title`、`validator-stat-label` 等：`#aaa`→`var(--text-tertiary)`
- `validator-ticket-section`、`validator-stat-card`、`validator-detail`：`#1a1a1a`→CSS 变量
- `validator-period-row` 边框：`#222`→`var(--border-light)`
- `btn-secondary`：暗色边框→翠绿 hover 高亮

**蒙特卡洛 (mc-*)**
- `mc-progress-bar`、`mc-dist-bar-wrap`：`#2a2a2a`、`#1e1e1e`→`var(--bg-surface)`
- 进度条颜色改为翠绿渐变

#### JavaScript 内联样式更新
- `var(--muted)` 引用 → `var(--text-secondary)` / `var(--text-tertiary)`
- 胆码标签颜色 `#c07000` → `#f59e0b`（琥珀色）
- 拖码标签颜色 `#3060cc` → `#3b82f6`（电蓝色）
- 分隔符颜色 `#444`、`#888` → `var(--text-tertiary)`
- 添加 `Geist Mono` 字体内联指定

---

## v1.19 — 2026-05-09

### 修复
- **K8 校验全面修正为 20 球**：快乐8每期从 1-80 摇出 20 个球，以下三处之前错误写死为 10 球，现全部改正：
  - 空号校验工具（蒙特卡洛 10 万注循环）
  - 历史验证器"随机一注"按钮
  - 自动选号生成参考组（`handleK8AutoStart`）

---

## v1.18 — 2026-04-26

### 新增
- **导航卡片拖拽排序**：长按任意卡片 420ms 进入拖拽模式，支持鼠标和触摸屏；松手后顺序自动保存到 localStorage，下次打开自动恢复
- **导航卡片等高**：所有卡片统一为第 1 张卡片的高度（`grid-auto-rows: 88px`），描述文字超出时自动省略

### 修复
- **K8 随机号码重复率高**：修复 `calcTicketSimilarity` 在无蓝球（K8）时相似度最高 0.72 < 阈值 0.75 导致差异化重试从未触发的 bug，现在直接返回红球相似度（0~1）
- **非自动模式多注缺乏差异化**：机选时多注生成也统一走差异化重试逻辑
- **性能**：`secureRandomInt` 改为模块级预分配 `Uint32Array`，避免每次摇号产生约 12000+ 次对象分配

### K8 自动选号
- 修复"开始生成参考组"按钮点击无反应（事件处理器缺失）
- 修复确认杀号后玩法选项卡点击无反应（`k8-confirm-kill`、`data-k8-mode` 事件处理器缺失）
- 参考组超过 10 组时自动折叠：仅显示第 1~3 组 + 最后一组（杀号组），中间可展开/收起

### 策略参数
- **去掉 killGroupCount 上限**：原来限制 2~6 组，现改为最低 1 组无上限；平均全零间隔 23.57 期时可正确更新为 24 组
- 同步修正 AI 自动校准中的相同限制

### 空号校验工具
- K8 区域移除"选一~选十"玩法选项卡（K8 校验固定 20 球与开奖比对，无需选法）

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
