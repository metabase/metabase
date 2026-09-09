---
name: typescript-review
description: Review TypeScript and JavaScript code changes for compliance with Metabase coding standards, style violations, and code quality issues. Use when reviewing pull requests or diffs containing TypeScript/JavaScript code.
allowed-tools: Read, Grep, Bash, Glob, Skill
---

# TypeScript/JavaScript Code Review Skill

@./../_shared/typescript-commands.md
@./../_shared/react-redux-patterns.md

## Standards

Read [typescript-write](../typescript-write/SKILL.md) for authoring requirements and modelling guidance.
Also apply `frontend/CLAUDE.md` and `docs/developers-guide/frontend.md`.

- Treat explicit requirements as requirements, including the prohibition on new explicit or inferred `any`.
- Apply modelling preferences under their stated conditions. A valid generic factory, intentional mutation, or optional API field is not a defect merely because a different pattern is often preferred.
- Use TypeScript LSP tools to inspect inferred types when available; otherwise use type checking and linting.

## Prioritise by impact

1. Security issues, data loss, and incorrect runtime behaviour.
2. Unsupported type guarantees and violations of explicit authoring requirements. The no-`any` rule remains blocking.
3. Maintainability, readability and consistency issues with a concrete consequence.

For each finding, identify the code, its consequence, and the requirement or condition that applies.
Do not raise a finding solely because an alternative style is possible.

## Assess verification

- For internal typed callers, do not request tests solely for inputs the type system excludes.
- External API data, deserialised values, storage and JavaScript callers can violate annotations. Check runtime validation and nontrivial assumptions at those boundaries.
- Assess behavioural, security and data-integrity coverage independently of whether the code type-checks.

## Additional review areas

Apply these when the change affects the relevant behaviour. Rank findings by their actual impact.

- **Accessibility:** keyboard support, focus management and accessible names for interactive elements, including modal focus trapping and icon-only controls.
- **Performance:** scaling, render cost, unstable references and missing memoisation where it matters.
- **Bundle size:** large dependencies, heavy modules loaded with a route, and unnecessarily broad imports.
- **Analytics:** for new user-facing flows, check whether an expected tracking event is missing and clarify the expectation when uncertain.
- **Embedding SDK:** consumers must be able to use public signatures and name types they need to import. Export those types deliberately, document public behaviour, and mark deprecated APIs with `@deprecated`. A referenced structural type does not automatically need its own named export.
