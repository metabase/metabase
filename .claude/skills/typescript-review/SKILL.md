---
name: typescript-review
description: Review TypeScript and JavaScript code changes for compliance with Metabase coding standards, style violations, and code quality issues. Use when reviewing pull requests or diffs containing TypeScript/JavaScript code.
allowed-tools: Read, Grep, Bash, Glob
---

# TypeScript/JavaScript Code Review Skill

@./../_shared/typescript-commands.md
@./../_shared/react-redux-patterns.md

Review pull requests by enforcing the patterns defined in the `typescript-write` skill and `frontend/CLAUDE.md`. Focus on:

- Readability and maintainability
- Appropriate test coverage
- Compliance with project coding standards and conventions
- Type safety and proper TypeScript usage
- React best practices

## Blind spots — act as the missing reviewer

These rarely surface in team reviews, so this skill should raise them:

- **Accessibility.** Interactive elements need keyboard support, focus management, and accessible names. Flag missing `aria-label`/`aria-labelledby`, non-semantic click targets, modals without focus trap, icon-only buttons without a label, and form inputs without a linked label.
- **Performance.** Flag renders that scale with list size but don't memoize; inline object/array literals passed to memoized children; effects that fire on every batch of a progressive load; and new dependencies added to hot paths.
- **Analytics.** User-facing flows should emit tracking events. If a PR adds a new flow (button, modal, navigation) without a tracking event, ask whether one is expected.
- **Security.** Flag `dangerouslySetInnerHTML`, unescaped user input rendered into URLs or HTML, `eval`/`new Function`, state-changing requests missing CSRF protection, raw user input in `target`/`href`, and `window.postMessage` handlers without origin checks.
- **Bundle size.** Flag new large dependencies, default imports from icon or util libs (`import Foo from 'lodash'`), `import * as X`, and heavy modules imported at route-load time instead of via `import()`. Ask if a tree-shakable named import or lazy load is possible.
