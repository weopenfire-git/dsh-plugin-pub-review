# dsh-plugin-pub-review — 发布就绪审查：给 dsh 插件做体检

[English](README.en.md) | [中文](README.md)

> 发布前一站式审查（publish-readiness review）：**查官方文档有没有更新 → 按官方规范做 30+ 项静态体检 → 只读预检 + 发布命令引导**。让「能不能发布」有依据，而不是靠感觉。

## 体检流程（医院比喻）

```
[1. 规则查验] ──> [2. 静态体检] ──> [3. 诊断报告] ──> [4. 预检与发布]
 (docs-check)     (plugin-review)    (✅/❌/⚠️ 药方)   (plugin-publish)
```

## 🎯 定位（与同类工具的分工）

dsh 生态里做「插件体检」的工具不少，本插件的分工是**发布就绪审查**：

| 层面 | 工具 | 干什么 |
|---|---|---|
| 规范与文档 | **dsh-plugin-pub-review（本插件）** | 对照**官方文档**查规范：文档新鲜度 + 30+ 项静态检查 + 发布命令引导 |
| 运行与安装 | [zoahdev/dsh-plugin-doctor](https://github.com/zoahdev/dsh-plugin-doctor) | 运行级验证：真实装包、fresh-profile 安装、供应链/环境诊断 |

- 它验证「装不装得上、安不安全」；本插件回答「**符不符合官方文档与规范、怎么发**」。
- 本插件的 publish 预检止步于 `npm pack --dry-run`；安装级验证是 zoahdev 版的范畴。
- 互补不重叠，可先后使用：先跑本插件过规范，再跑它做运行验证。

## 🚀 现状

| 版本 | 亮点 |
|---|---|
| v0.2.0 | 更名 dsh-plugin-pub-review（原 dsh-plugin-doctor），突出「发布就绪审查」定位 |
| v0.1.x | 三个工具 + 斜杠命令 + 启动横幅 + 测试 |

## 工具

### 1. docs-check —— 审查前的「医学规范核查」

避免用过期规则「错诊」：审查前自动核对官方插件开发文档是否更新。

- **多源回退**：优先 GitHub contents API（按文件 `sha` 快速比对，网络实测可达 200）；失败时自动回退本地 DSHarness checkout
- **状态持久化**：`~/.dsh/plugin-pub-review/docs-state.json` 记录每篇上次 `sha` 与检查时间；官方规则更新时提醒「规则库需要复核」

### 2. plugin-review —— 静态「全身体检」与诊断

对目标插件仓库做 **30+ 项静态检查**，输出 ✅/⚠️/❌ 清单 + 修复药方 + 发布就绪判定（Ready / Not Ready）。

| 检查文件 | 诊断关注点 |
|---|---|
| package.json | `type: "module"`、main/types/exports 指向 lib、files 只发 lib、scripts（build/typecheck/test/prepare）、peerDependencies 用范围（cordis + dsh-*）、schemastery 在 dependencies |
| tsconfig.json | strict、declaration、outDir lib/types、rootDir src、moduleResolution bundler、TS 扩展重写 |
| tsdown.config.ts | entry 指向 lib/types/index.js、**clean: false** |
| vitest.config.ts | root 指向仓库根、include tests/**/*.spec.ts |
| src/index.ts | name / inject / apply 三件套 |
| 仓库基础 | .gitignore（node_modules/ lib/ .dsh/）、tests/ 用例存在、README 双语 + Changelog、version.ts 同步 |

### 3. plugin-publish —— 预检与「出院」发布引导

- **只读安全预检**：自动依次执行 `typecheck → test → build → npm pack --dry-run`
- **发布指令安全下发**：生成 git commit/tag/push 命令序列（`autoRunGit=true` 时自动执行）
- **2FA 人工安全屏障**：涉及账号安全的 `npm publish` 始终保留给你手动确认

## 架构要点

- **纯函数式检测**：配置文件解析 + 正则匹配，毫秒级完成全部检查，不依赖笨重的 AST 库
- **软集成（零硬依赖）**：斜杠命令通过 `ctx.get('commands')` 注册；宿主未挂载 commands 服务时静默跳过，仅保留工具能力，绝不侵入宿主
- **确定性状态机**：✅ Pass / ⚠️ Warning / ❌ Error（发布阻断）三态，每条带可复制的修复药方

## 诚实边界

1. **规则是手写的**；docs-check 只检测「文档变了没有」，不自动提取新规则——变了由 agent 复核该核对的点。
2. **npm publish 需要用户 2FA**，插件只预检 + 引导。
3. 静态检查能抓结构/构建/发布问题；更深的设计/逻辑问题由 agent 根据报告处理。

## 安装与使用

**开发期**：profile 的 `cordis.patch.yml` 加 host 行：

```yaml
- insert:
    - id: dsh-plugin-pub-review
      name: file:///D:/work/ClaudeCode/dsh-plugin-doctor/src/index.ts
```

**正式使用**：`dsh plugin --profile <name> add @yinging/dsh-plugin-pub-review`

**使用**：加载后终端打印启动横幅；斜杠命令：

- `/plugin-review` —— 先查官方文档更新，再对当前工作区仓库静态体检，输出报告与发布就绪判定
- `/plugin-publish` —— 运行预检流水线，给出发布命令序列
- `/doctor-help` —— 显示本使用引导

**配置（config.ts）**：

| 字段 | 默认 | 含义 |
|---|---|---|
| docsUrls | basic 四篇 contents API | 要查更新的官方文档 |
| docsStateFile | ~/.dsh/plugin-pub-review/docs-state.json | 上次哈希状态 |
| checkDocsBeforeReview | true | review 前先查文档 |
| autoRunGit | false | publish 是否自动跑 git 步骤 |

> 独立插件仓库，符合 dsh 插件规范（骨架见 hme-plugin 的 `dsh-plugin-skeleton` skill）。

## Changelog

- v0.2.0 — 更名 **dsh-plugin-pub-review**（原 dsh-plugin-doctor，npm 旧包已弃用），明确「发布就绪审查」定位：官方文档符合性 + 静态规范体检 + 发布引导；文档状态路径改为 `~/.dsh/plugin-pub-review/`。
- v0.1.1 — 启动横幅与 `/doctor-help` 引导命令；README 补全流程/检查点/架构/配置说明。
- v0.1.0 — 首个发布：三个工具完整实现（docs-check 多源哈希对比、plugin-review 静态体检、plugin-publish 预检 + 命令生成）、两个斜杠命令、vitest 用例。
