# dsh-plugin-doctor — 给 dsh 插件做体检

[English](README.en.md) | [中文](README.md)

> 诊断、审查、发布引导三合一的 DeepSeek Harness 插件：帮「别的插件」对照官方文档与规范做体检，审查前先查官方文档有没有更新，最后引导发布流程。

## 🚀 现状

| 版本 | 亮点 |
|---|---|
| v0.1.0 | 三个工具完整实现（docs-check / plugin-review / plugin-publish）+ 两个斜杠命令 + 测试齐全 |

## 设计要点（详见 DESIGN.md）

- **docs-check**：审查前先查官方文档有没有更新（GitHub contents API 哈希对比，本地 checkout 兜底）
- **plugin-review**：静态体检目标插件仓库，输出 ✅/❌/⚠️ 清单 + 修复建议 + 发布就绪判定
- **plugin-publish**：预检（typecheck/test/build/npm pack）+ 生成发布命令序列
- 命令：`/plugin-review`、`/plugin-publish`

## 诚实边界

1. **规则是手写的**；docs-check 只检测「文档变了没有」，不自动提取新规则——变了由 agent 复核该核对的点。
2. **npm publish 需要用户 2FA**，插件只预检 + 引导。
3. 静态检查能抓结构/构建/发布问题；更深的设计/逻辑问题由 agent 根据报告处理。

## 安装（开发期）

在 profile 的 `cordis.patch.yml` 加 host 行：

```yaml
- insert:
    - id: dsh-plugin-doctor
      name: file:///D:/work/ClaudeCode/dsh-plugin-doctor/src/index.ts
```

> 独立插件仓库，符合 dsh 插件规范（骨架见 hme-plugin 的 `dsh-plugin-skeleton` skill）。

## Changelog

- v0.1.0 — 首个发布：三个工具完整实现（docs-check 多源哈希对比、plugin-review 静态体检、plugin-publish 预检 + 命令生成）、`/plugin-review` 与 `/plugin-publish` 斜杠命令、vitest 用例、发布到 npm。
