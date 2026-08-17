# dsh-plugin-doctor — checkup for dsh plugins

[English](README.en.md) | [中文](README.md)

> A diagnose / review / publish-guidance plugin for DeepSeek Harness: checks other plugins against the official docs and conventions, verifies the official docs have not changed before reviewing, then guides the publish flow.

## Status

| Version | Highlights |
|---|---|
| v0.1.0 | All three tools implemented (docs-check / plugin-review / plugin-publish) + two slash commands + full test suite |

## Design (see DESIGN.md)

- **docs-check**: verify official plugin-dev docs have not changed since the last check (GitHub contents API sha compare; local checkout fallback)
- **plugin-review**: statically audit a target plugin repo; output a pass/fail checklist with fix suggestions and a publish-readiness verdict
- **plugin-publish**: preflight (typecheck/test/build/npm pack) + emit the publish command sequence
- Commands: `/plugin-review`, `/plugin-publish`

## Honest boundaries

1. The rule set is hand-written; docs-check only detects that the docs changed — it does not extract new rules automatically. When they change, an agent re-verifies the review points.
2. `npm publish` requires the user's 2FA; the plugin only preflights and guides.
3. Static checks catch structural/build/publish issues; deeper design or logic issues are handled by an agent from the report.

## Install (development)

Add a host entry to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-plugin-doctor
      name: file:///D:/work/ClaudeCode/dsh-plugin-doctor/src/index.ts
```

> Standalone plugin repo following the dsh plugin conventions (skeleton from the `dsh-plugin-skeleton` skill, see hme-plugin).

## Changelog

- v0.1.0 — first release: all three tools implemented (docs-check multi-source sha compare, plugin-review static audit, plugin-publish preflight + command generation), `/plugin-review` and `/plugin-publish` slash commands, vitest suite, published to npm.
