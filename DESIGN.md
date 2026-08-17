# dsh-plugin-doctor 设计文档

> 本仓库当前是**脚手架**：配置与构建已就绪、三个工具是桩（返回 TODO）、冒烟测试通过。在另一个窗口按本文实现三个工具，跑通测试后发布 v0.1.0。

## 定位

给「别的 DeepSeek Harness 插件」做体检的工具插件。与 `dsh-plugin-skeleton` skill 互补：skill 教你**怎么建**，doctor 帮你**查**。

医生比喻贯穿全程：**体检**（静态检查）→ **症状**（✅/❌/⚠️ 清单）→ **药方**（修复建议）→ **出院标准**（发布就绪判定）。

## 工具

### 1. docs-check —— 审查前先查官方文档有没有更新

**目的**：每次审查前确认官方插件开发文档是否变化，避免用过期规范审人。

**数据源（多源回退，网络已实测）**：
- 主：GitHub contents API —— `https://api.github.com/repos/deepseek-ai/deepseek-harness/contents/docs/...`（返回文件 `sha`，直接比对哈希即可）。**实测可达（200）**。
- 备：本地 DSHarness checkout `docs/user/develop/basic/*.md`（离线兜底，`git pull` 后即最新）。
- ❌ 已知不可达：`raw.githubusercontent.com`（被墙，000）、jsdelivr gh 镜像（404）。

**默认文档集**（官方插件开发四篇）：`basic/{index,config,tool,publish}.md`。

**状态文件**：`~/.dsh/plugin-doctor/docs-state.json`（每篇 sha + 上次检查时间）。

**输出**：每篇「自 <时间> 未变 / 已更新」，若更新则提示「规则库需要复核」。

### 2. plugin-review —— 静态体检目标插件仓库

**流程**：`checkDocsBeforeReview=true` 时先跑 docs-check → 读取目标仓库文件 → 逐项检查 → 报告。

**体检项（手写规则，来自骨架 skill 的 14 坑 + 官方 basic 文档）**：

| 文件 | 检查点 |
|---|---|
| package.json | name/version、type:module、main/types/exports 指 lib、files 只发 lib、scripts 含 build/typecheck/test/prepare、peerDeps 含 cordis+dsh-*（范围）、schemastery 在 dependencies、keywords 含 dsh-plugin |
| tsconfig.json | strict、declaration、outDir lib/types、rootDir src、moduleResolution bundler、allowImportingTsExtensions + rewriteRelativeImportExtensions |
| tsdown.config.ts | entry lib/types/index.js、outDir lib、**clean: false** |
| vitest.config.ts | root 指向仓库根、include tests/**/*.spec.ts |
| src/index.ts | name / inject / apply 三件套存在 |
| .gitignore | node_modules/、lib/、.dsh/ |
| tests/ | 目录存在、有用例 |
| README | 双语、changelog |

**输出**：逐项 ✅/❌/⚠️ + 修复建议 + **发布就绪判定**（ready / not ready + 缺失项列表）。

### 3. plugin-publish —— 预检 + 发布引导

**预检（只读，可自动跑）**：`pnpm run typecheck` → `pnpm run test` → `pnpm run build` → `npm pack --dry-run`。

**发布命令序列（生成给用户）**：
```sh
git add -A && git commit -m "feat: ..."
git tag v0.1.0
git push origin main && git push origin v0.1.0   # lightweight tag 显式推
pnpm publish   # 需要用户 2FA
```

**执行策略**：`autoRunGit=false`（默认）只打印命令；`true` 则自动跑 git 步骤（child_process）。**npm publish 始终留给用户**（2FA 无法代跑）。

## 命令（软集成）

- `/plugin-review`、`/plugin-publish` —— 通过 `ctx.get('commands')` 注册（commands 服务未挂载则静默跳过，无硬依赖）。

## 配置（config.ts 已就绪）

| 字段 | 默认 | 含义 |
|---|---|---|
| docsUrls | basic 四篇 contents API | 要查更新的官方文档 |
| docsStateFile | ~/.dsh/plugin-doctor/docs-state.json | 上次哈希状态 |
| checkDocsBeforeReview | true | review 前先查文档 |
| autoRunGit | false | publish 是否自动跑 git 步骤 |

## 诚实边界（写进 README）

1. **规则是手写的**；docs-check 只检测「文档变了没有」，不自动提取新规则——变了由 agent 复核该核对的点。
2. **npm publish 需要用户 2FA**，插件只预检 + 引导。
3. 静态检查能抓结构/构建/发布问题；更深的设计/逻辑问题由 agent 根据报告处理。

## 实现顺序建议

1. docs-check（自包含、可独立测试）
2. plugin-review 的静态检查项（纯函数，逐项可测）
3. plugin-publish 预检 + 命令生成
4. 两个斜杠命令
5. 冒烟测试齐全 → typecheck/test/build → git commit/tag/push → npm publish v0.1.0
