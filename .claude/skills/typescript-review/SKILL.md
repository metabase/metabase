---
name: typescript-review
description: Review TypeScript and JavaScript code changes for compliance with Metabase coding standards, style violations, and code quality issues. Use when reviewing pull requests or diffs containing TypeScript/JavaScript code.
allowed-tools: Read, Grep, Bash, Glob, Skill
---

# TypeScript/JavaScript Code Review Skill

@./../_shared/typescript-commands.md
@./../_shared/react-redux-patterns.md

## Main Focus

**Primary standard: the [`typescript-write`](../typescript-write/SKILL.md) skill.** Load it first — it defines the authoring rules this review enforces, alongside `frontend/CLAUDE.md` and `docs/developers-guide/frontend.md`.

Adherence to `typescript-write` is the **highest-priority** review dimension: rank any violation of its provisions above all other findings. Treat its **no-`any` hard rule** (no explicit *or* implicit `any` in new code) as **blocking**, and verify it with the LSP rather than by eye.

Review in this priority order:

1. **Violations of [`typescript-write`](../typescript-write/SKILL.md) provisions** — no-`any`, type tightening, type modeling, null/undefined handling, naming, structure, comments. Highest priority; block on the no-`any` rule.
2. Compliance with `frontend/CLAUDE.md`.
3. Readability and maintainability.
4. Appropriate test coverage.

## Blind spots — act as the missing reviewer

These rarely surface in team reviews, so this skill should raise them. They are **additive** — raise them, but rank them below `typescript-write` violations:

- **Accessibility.** Interactive elements need keyboard support, focus management, and accessible names. Flag missing `aria-label`/`aria-labelledby`, non-semantic click targets, modals without focus trap, icon-only buttons without labels, and form inputs without a linked label.
- **Performance.** Flag areas that scale poorly and aren't memoized; inline object/array literals passed to memoized children; effects that fire on every batch of a progressive load; and new dependencies added to hot paths.
- **Security.** Evaluate potential security issues in new code.
- **Bundle size.** Flag new large dependencies, default imports from icon or util libs, and heavy modules imported at route-load time.
- **Analytics.** User-facing flows should emit tracking events. If a PR adds a new flow (button, modal, navigation) without a tracking event, ask whether one is expected.
