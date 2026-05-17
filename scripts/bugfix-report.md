# Bug 修复报告：单式模式偶现复式号码

**日期**：2026-05-17  
**版本**：v1.22 → 修复后

---

## 复现结果

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 50,000 次单式生成 | 4972 次异常（9.9%） | 0 次异常 |
| 12 组 OE×BS 交叉测试 | 11 组失败 | 12 组全部通过 |

---

## 根因分析

**问题出在 `drawWithDualConstraint` 函数的 `minOddBig` 下界不完整。**

### 背景

`drawWithDualConstraint` 将号码池按奇偶/大小两个维度分成 4 个象限：
- 奇大、奇小、偶大、偶小

然后解方程确定每个象限各抽几个球：
```
oddBigCount = x
oddSmallCount = oddNeeded - x
evenBigCount = bigNeeded - x
evenSmallCount = evenNeeded - evenBigCount = evenNeeded - bigNeeded + x
```

`x` 需要满足一个取值范围 `[minOddBig, maxOddBig]`。

### 缺陷

**修复前的 `minOddBig` 计算：**
```javascript
minOddBig = Math.max(0, oddNeeded - oddSmall.length, bigNeeded - evenBig.length);
```

缺少了对 `evenSmallCount ≥ 0` 的约束。当用户选择的奇偶比/大小比在随机翻转后出现"矛盾"组合时：

**具体失败场景**：奇偶比翻转为 4奇2偶，大小比翻转为 4大2小

| 象限 | 需求推导 | oddBigCount=0 时的实际抽取 |
|------|---------|--------------------------|
| 奇大 | x = 0 | 0 个 |
| 奇小 | 4 - 0 = 4 | 4 个 |
| 偶大 | 4 - 0 = 4 | **4 个**（但总共只需要 2 个偶数！）|
| 偶小 | 2 - 4 = **-2** | **跳过**（负数被 `> 0` 守卫静默忽略）|
| **合计** | | **8 个球** ← 这就是 bug |

### 修复

在 `minOddBig` 中加入第三项 `bigNeeded - evenNeeded`，确保 `evenBigCount ≤ evenNeeded`：

```javascript
// 修复前
minOddBig = Math.max(0, oddNeeded - oddSmall.length, bigNeeded - evenBig.length);
maxOddBig = Math.min(oddNeeded, bigNeeded, oddBig.length);

// 修复后
minOddBig = Math.max(0, oddNeeded - oddSmall.length, bigNeeded - evenBig.length, bigNeeded - evenNeeded);
maxOddBig = Math.min(oddNeeded, bigNeeded, oddBig.length, evenSmall.length - evenNeeded + bigNeeded);
```

两项新增约束的数学含义：
- **下界 `bigNeeded - evenNeeded`**：保证 `evenBigCount ≤ evenNeeded`，即偶数大数不超过所需偶数总数
- **上界 `evenSmall.length - evenNeeded + bigNeeded`**：保证 `evenSmallCount ≤ evenSmall.length`，即偶数小数不超过可用池

---

## 修改文件

- `script.js` 第 493-494 行：`drawWithDualConstraint` 函数
- `scripts/test-odd-even-bug.js` 第 139-140 行：同步修复测试副本
