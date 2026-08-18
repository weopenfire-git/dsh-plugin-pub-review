# dsh-plugin-pub-review — publish-readiness review for dsh plugins

[English](README.en.md) | [中文](README.md)

> One-stop publish-readiness review: **check whether the official docs changed → run 30+ static checks against the official conventions → read-only preflight + publish command guidance**. "Can this plugin be published?" becomes evidence-based, not a feeling.

## Checkup flow (hospital metaphor)

```
[1. Rule check] ──> [2. Static exam] ──> [3. Diagnosis] ──> [4. Preflight & publish]
 (docs-check)      (plugin-review)      (✅/❌/⚠️ fix)      (plugin-publish)
```

## Positioning

A publish-readiness review answers two questions: **can this plugin be published**, and **how**.

1. **Verify the official docs first**: docs-check confirms the official plugin-dev docs have not changed — never diagnose with stale rules;
2. **Then audit against the conventions**: plugin-review runs 30+ static checks against the official basic docs plus hard-won skeleton rules, emitting a ✅/⚠️/❌ checklist, fix prescriptions and a Ready / Not-Ready verdict;
3. **Finally guide the publish**: plugin-publish runs a read-only preflight (typecheck/test/build/npm pack) and generates the git commit/tag/push sequence — `npm publish` always stays with you (the 2FA barrier).

## Status

| Version | Highlights |
|---|---|
| v0.2.1 | README rework: no other plugins named in the main body; the tool-comparison table moved to the end |
| v0.2.0 | Renamed to dsh-plugin-pub-review (formerly dsh-plugin-doctor), sharpening the publish-readiness positioning |
| v0.1.x | Three tools + slash commands + startup banner + tests |

## Tools

### 1. docs-check — verify the official docs before reviewing

Avoid diagnosing with stale rules: automatically verify the official plugin-dev docs have not changed since the last check.

- **Multi-source fallback**: GitHub contents API first (fast per-file `sha` compare; reachable in practice), falling back to a local DeepSeek Harness checkout on failure
- **Persisted state**: `~/.dsh/plugin-pub-review/docs-state.json` records the last `sha` and check time per doc; an update triggers a "rule set needs re-review" reminder

### 2. plugin-review — static full-body checkup

Runs **30+ static checks** on a target plugin repo and outputs a ✅/⚠️/❌ checklist with fix prescriptions and a publish-readiness verdict (Ready / Not Ready).

| File | Focus |
|---|---|
| package.json | `type: "module"`, main/types/exports point to lib, files ships only lib, scripts (build/typecheck/test/prepare), ranged peerDependencies (cordis + dsh-*), schemastery in dependencies |
| tsconfig.json | strict, declaration, outDir lib/types, rootDir src, moduleResolution bundler, TS extension rewriting |
| tsdown.config.ts | entry points to lib/types/index.js, **clean: false** |
| vitest.config.ts | root at the repo root, include tests/**/*.spec.ts |
| src/index.ts | the name / inject / apply trio |
| repo basics | .gitignore (node_modules/ lib/ .dsh/), tests/ cases present, bilingual README + Changelog, version.ts in sync |

### 3. plugin-publish — preflight and discharge guidance

- **Read-only safe preflight**: runs `typecheck → test → build → npm pack --dry-run` in order
- **Safe command issuance**: generates the git commit/tag/push sequence (`autoRunGit=true` executes it automatically)
- **2FA human barrier**: `npm publish` always stays with you because it touches your account

## Architecture

- **Pure-function detection**: config-file parsing + regex matching completes every check in milliseconds, no heavyweight AST library
- **Soft integration (zero hard deps)**: slash commands register via `ctx.get('commands')`; when the host has no commands service they are silently skipped and only the tool API remains — never invasive
- **Deterministic state machine**: ✅ Pass / ⚠️ Warning / ❌ Error (publish-blocking) with a copyable fix prescription per item

## Honest boundaries

1. The rule set is hand-written; docs-check only detects that the docs changed — it does not extract new rules automatically. When they change, an agent re-verifies the review points.
2. `npm publish` requires the user's 2FA; the plugin only preflights and guides.
3. Static checks catch structural/build/publish issues; deeper design or logic issues are handled by an agent from the report.

## Install & use

**Development**: add a host entry to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-plugin-pub-review
      name: file:///D:/work/ClaudeCode/dsh-plugin-pub-review/src/index.ts
```

**Installed**: `dsh plugin --profile <name> add @yinging/dsh-plugin-pub-review`

**Use**: a startup banner is printed when the plugin loads; slash commands:

- `/plugin-review` — checks the official docs first, then statically audits the current workspace repo and reports with a readiness verdict
- `/plugin-publish` — runs the preflight pipeline and prints the publish command sequence
- `/doctor-help` — shows this guidance

**Config (config.ts)**:

| Field | Default | Meaning |
|---|---|---|
| docsUrls | the four basic contents API URLs | official docs to freshness-check |
| docsStateFile | ~/.dsh/plugin-pub-review/docs-state.json | last-checked hash state |
| checkDocsBeforeReview | true | run docs-check before a review |
| autoRunGit | false | whether publish runs the git steps |

## Comparison with similar tools

Several dsh tools cover plugin health / review / verification. The table compares them by **coverage stage** (per each repo's official description; "—" means that description does not cover the stage):

| Tool | Docs freshness | Static conventions | Build/pack | Install verification | Env diagnostics | Publish guidance | Official positioning (summary) |
|---|---|---|---|---|---|---|---|
| **dsh-plugin-pub-review (this plugin)** | ✅ | ✅ (30+) | ✅ (read-only preflight) | — | — | ✅ (git sequence + npm guidance) | Publish-readiness review: official-docs conformance + static audit + publish guidance |
| [dsh-plugin-check](https://github.com/dsh-external/dsh-plugin-check) | — | ✅ | — | — | — | — | Plugin health checks (manifest/patch format, build pitfalls, hub status) |
| [zoahdev/dsh-plugin-doctor](https://github.com/zoahdev/dsh-plugin-doctor) | — | ✅ | ✅ | ✅ (fresh-profile install) | ✅ | ✅ (check/preflight verdict) | Runtime-level verification: packing, install, supply-chain preflight, env diagnostics |
| [dsh-test-drive](https://github.com/PerryLink/dsh-test-drive) | — | — | — | ✅ (install-smoke-uninstall) | — | — | Isolated install-smoke-uninstall test drives for DSH plugins |
| [dsh-inspect](https://github.com/dsh-external/dsh-inspect) | — | ✅ (adversarial) | — | — | — | — | checkup → fix → review adversarial loop |
| [dsh-review-loop](https://github.com/wuxiangru915/dsh-review-loop) | — | — | — | — | — | — | Incremental diff review loop (code review, not plugin health) |
| [dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck) | — | ✅ (gates) | — | — | — | — | Engineering-discipline loop: requirement grilling, red/green gates, adversarial delivery review |
| [dsh-ops-skill](https://github.com/dragon43pp/dsh-ops-skill) | — | — | — | — | — | — | Runtime reliability kit: state snapshots, upgrade diffs, regression checks |
| [dsh-verification-receipt](https://github.com/030611/dsh-verification-receipt) | — | — | — | — | — | — | Per-turn tool counts and coarse verification signals to local JSONL |
| [dsh-doctor](https://github.com/ciceroyang/dsh-doctor) | — | — | — | — | ✅ | — | One-command local environment health check (versions/port/config/session logs) |

**Conclusion**: the two stages unique to this plugin are **docs freshness** and **publish command guidance** — no other tool covers them. Static convention checks partially overlap but differ in focus (a hand-written checklist against the official basic docs + skeleton rules). Install verification and environment diagnostics are intentionally out of scope here (see Honest boundaries); for a full publish checkup, run this plugin for conventions first, then pair it with install/environment verification tools for the runtime side.

## Changelog

- v0.2.1 — README rework: no other plugins named in the main body; the tool-comparison table moved to the end.
- v0.2.0 — renamed to **dsh-plugin-pub-review** (formerly dsh-plugin-doctor; the old npm package is deprecated), sharpening the publish-readiness positioning: official-docs conformance + static review + publish guidance; the docs state path moved to `~/.dsh/plugin-pub-review/`.
- v0.1.1 — startup banner and `/doctor-help` guidance command; README covers the checkup flow, checkpoint table, architecture and config.
- v0.1.0 — first release: all three tools implemented (docs-check multi-source sha compare, plugin-review static audit, plugin-publish preflight + command generation), two slash commands, vitest suite.
