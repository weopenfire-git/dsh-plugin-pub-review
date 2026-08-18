# dsh-plugin-pub-review — publish-readiness review for dsh plugins

[English](README.en.md) | [中文](README.md)

> One-stop publish-readiness review: **check whether the official docs changed → run 30+ static checks against the official conventions → read-only preflight + publish command guidance**. "Can this plugin be published?" becomes evidence-based, not a feeling.

## Checkup flow (hospital metaphor)

```
[1. Rule check] ──> [2. Static exam] ──> [3. Diagnosis] ──> [4. Preflight & publish]
 (docs-check)      (plugin-review)      (✅/❌/⚠️ fix)      (plugin-publish)
```

## 🎯 Positioning (division of labor)

Several "plugin health check" tools exist in the dsh ecosystem; this plugin owns **publish-readiness review**:

| Layer | Tool | What it does |
|---|---|---|
| Conventions & docs | **dsh-plugin-pub-review (this plugin)** | Checks against the **official docs**: docs freshness + 30+ static checks + publish command guidance |
| Runtime & install | [zoahdev/dsh-plugin-doctor](https://github.com/zoahdev/dsh-plugin-doctor) | Runtime-level verification: real packing, fresh-profile install, supply-chain/environment diagnostics |

- It verifies "does it install, is it safe"; this plugin answers "**does it conform to the official docs and conventions, and how to publish**".
- This plugin's preflight stops at `npm pack --dry-run`; install-level verification belongs to zoahdev's.
- Complementary, not overlapping — use both in sequence: pass this one for conventions, then theirs for runtime.

## Status

| Version | Highlights |
|---|---|
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
      name: file:///D:/work/ClaudeCode/dsh-plugin-doctor/src/index.ts
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

> Standalone plugin repo following the dsh plugin conventions (skeleton from the `dsh-plugin-skeleton` skill, see hme-plugin).

## Changelog

- v0.2.0 — renamed to **dsh-plugin-pub-review** (formerly dsh-plugin-doctor; the old npm package is deprecated), sharpening the publish-readiness positioning: official-docs conformance + static review + publish guidance; the docs state path moved to `~/.dsh/plugin-pub-review/`.
- v0.1.1 — startup banner and `/doctor-help` guidance command; README covers the checkup flow, checkpoint table, architecture and config.
- v0.1.0 — first release: all three tools implemented (docs-check multi-source sha compare, plugin-review static audit, plugin-publish preflight + command generation), two slash commands, vitest suite.
