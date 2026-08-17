# dsh-plugin-doctor — 给 dsh 插件做体检

[English](README.en.md) | [中文](README.md)

> 诊断、审查、发布引导三合一的 DeepSeek Harness 插件：帮「别的插件」对照官方文档与规范做体检，审查前先查官方文档有没有更新，最后引导发布流程。

## 体检流程（医院比喻）

```
[1. 规则查验] ──> [2. 静态体检] ──> [3. 诊断报告] ──> [4. 预检与发布]
 (docs-check)     (plugin-review)    (✅/❌/⚠️ 药方)   (plugin-publish)
```

## 🚀 现状

| 版本 | 亮点 |
|---|---|
| v0.1.1 | 启动横幅 + `/doctor-help` 引导命令；README 补全流程/检查点/架构/配置说明 |
| v0.1.0 | 三个工具完整实现 + `/plugin-review`、`/plugin-publish` 斜杠命令 + 测试齐全 |

## 工具

### 1. docs-check —— 审查前的「医学规范核查」

避免用过期规则「错诊」：审查前自动核对官方插件开发文档是否更新。

- **多源回退**：优先 GitHub contents API（按文件 `sha` 快速比对，网络实测可达 200）；失败时自动回退本地 DSHarness checkout
- **状态持久化**：`~/.dsh/plugin-doctor/docs-state.json` 记录每篇上次 `sha` 与检查时间；官方规则更新时提醒「规则库需要复核」

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
    - id: dsh-plugin-doctor
      name: file:///D:/work/ClaudeCode/dsh-plugin-doctor/src/index.ts
```

**正式使用**：`dsh plugin --profile <name> add @yinging/dsh-plugin-doctor`

**使用**：加载后终端打印启动横幅；斜杠命令：

- `/plugin-review` —— 先查官方文档更新，再对当前工作区仓库静态体检，输出报告与发布就绪判定
- `/plugin-publish` —— 运行预检流水线，给出发布命令序列
- `/doctor-help` —— 显示本使用引导

**配置（config.ts）**：

| 字段 | 默认 | 含义 |
|---|---|---|
| docsUrls | basic 四篇 contents API | 要查更新的官方文档 |
| docsStateFile | ~/.dsh/plugin-doctor/docs-state.json | 上次哈希状态 |
| checkDocsBeforeReview | true | review 前先查文档 |
| autoRunGit | false | publish 是否自动跑 git 步骤 |

> 独立插件仓库，符合 dsh 插件规范（骨架见 hme-plugin 的 `dsh-plugin-skeleton` skill）。

## Changelog

- v0.1.1 — 启动横幅与 `/doctor-help` 引导命令；README 补全体检流程、检查点表、架构与配置说明。
- v0.1.0 — 首个发布：三个工具完整实现（docs-check 多源哈希对比、plugin-review 静态体检、plugin-publish 预检 + 命令生成）、两个斜杠命令、vitest 用例、发布到 npm。
