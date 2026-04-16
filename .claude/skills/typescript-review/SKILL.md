---
name: typescript-review
description: Review TypeScript and JavaScript code changes for compliance with Metabase coding standards, style violations, and code quality issues. Use when reviewing pull requests or diffs containing TypeScript/JavaScript code.
allowed-tools: Read, Grep, Bash, Glob
---

# TypeScript/JavaScript Code Review Skill

@./../_shared/typescript-commands.md
@./../_shared/typescript-patterns.md
@./../_shared/react-redux-patterns.md
@./../_shared/testing-patterns.md

## Review checklist

Flag each of these when present. The patterns files above define the rules — this checklist drives what to look for.

**Types**
- `as`, `any`, `unknown` used to silence the compiler — propose a narrower signature instead.
- JSDoc `@param`/`@returns` type annotations in `.ts`/`.tsx` files.
- Local redefinition of a type guard that already lives in `metabase-types/guards/`.
- Primitives restated instead of `SomeType["field"]`.

**Null/undefined**
- `undefined` threaded through multiple layers without a reason.
- Missing `?.` / `?? []` at a consumer that really does receive an optional value.
- Comparisons between `undefined` and a number.

**React / Redux / data**
- Side effects inside `useMemo`.
- New class component.
- Loading state derived from data truthiness rather than tracked explicitly.
- Data fetch buried deep in a render path instead of at the owning component.
- Hand-rolled `cy.intercept` or `fetch` where a helper exists.

**Reuse and shape**
- Helper or component with exactly one call site (should be inlined).
- Duplicated logic across 2+ call sites (should be a hook or util).
- Feature-specific code placed in `metabase-lib` or shared code placed in a feature folder.
- Dead code: unused exports, unreachable branches, functions that compute one thing but are still shaped like they compute several.

**Naming**
- Names that describe mechanism instead of meaning (`ref` for a non-ref, `data` for something specific).
- Sibling concepts out of alignment (e.g. `HoveredObject` vs `ClickObject`).

**Comments**
- Missing comment on "clever" code (progressive loaders, reducers, race-condition handling).
- Comments that reference tickets, authors, or "added for X" — ask to remove.

**Tests**
- New mock factory when an existing one covers the case.
- API helper inlined in a spec instead of `e2e/support/helpers/api/`.
- `Cypress.env` usage.
- Unit spec that asserts shape only — ask for a behavior-level test.

## Blind spots — act as the missing reviewer

These rarely surface in team reviews, so this skill should raise them:

- **Accessibility.** Interactive elements need keyboard support, focus management, and accessible names. Flag missing `aria-label`/`aria-labelledby`, non-semantic click targets, modals without focus trap, icon-only buttons without a label, and form inputs without a linked label.
- **Performance.** Flag renders that scale with list size but don't memoize; inline object/array literals passed to memoized children; effects that fire on every batch of a progressive load; and new dependencies added to hot paths.
- **Analytics.** User-facing flows should emit tracking events. If a PR adds a new flow (button, modal, navigation) without a tracking event, ask whether one is expected.
