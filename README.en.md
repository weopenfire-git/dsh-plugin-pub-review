# dsh-plugin-doctor — checkup for dsh plugins

[English](README.en.md) | [中文](README.md)

> A diagnose / review / publish-guidance plugin for DeepSeek Harness: checks other plugins against the official docs and conventions, verifies the official docs have not changed before reviewing, then guides the publish flow.

## Status

| Version | Highlights |
|---|---|
| v0.1.0 | Scaffold: repo layout + config schema + three tool stubs + design doc |

## Design (see DESIGN.md)

- **docs-check**: verify official plugin-dev docs have not changed since the last check (GitHub contents API sha compare; local checkout fallback)
- **plugin-review**: statically audit a target plugin repo; output a pass/fail checklist with fix suggestions and a publish-readiness verdict
- **plugin-publish**: preflight (typecheck/test/build/npm pack) + emit the publish command sequence
- Commands: `/plugin-review`, `/plugin-publish`
