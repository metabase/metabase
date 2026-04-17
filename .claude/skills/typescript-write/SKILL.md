---
name: typescript-write
description: Write TypeScript and JavaScript code following Metabase coding standards and best practices. Use when developing or refactoring TypeScript/JavaScript code.
---

# TypeScript/JavaScript Development Skill

@./../_shared/development-workflow.md
@./../_shared/typescript-commands.md
@./../_shared/react-redux-patterns.md

## Type tightening

- Do not add `as` casts, `any`, or loose `unknown` to make code compile. Fix the signature instead.
- If a function only needs one field of a wide object, accept that field — not the wide object. The cast often disappears once the signature is right.
- Reach for `Partial<T>`, `Pick<T, K>`, `Record<K, V>`, and generics before reaching for a cast.
- Prefer making props/components generic (`<T>`) when a value flows through unchanged and the caller knows the type.
- Type guards belong in `frontend/src/metabase-types/guards/`. Do not redefine them locally.
- Avoid non-strict null comparisons (`X != null`) when `X` can never be `null` — use a strict check or narrow the type.

## Null and undefined

- Narrow at the source. If a value is optional only in a corner case, don't thread `undefined` through every layer — guard at the producer.
- If a value really is optional, use `?.` and `?? []` at the consumer. Don't compare `undefined` to a number.
- Arrays of `undefined` are almost always a signal that something upstream should have filtered or defaulted.

## Naming

- Names describe the thing, not the mechanism. `LensLocation` beats `ref` when the value isn't a React ref.
- Align sibling concepts: `HoverObject`/`ClickObject`, not `HoveredObject`/`ClickObject`.
- If you introduce a helper like "go back to base path," call it `goBack` and use it everywhere the inline `dispatch(push(BASE_PATH))` appears.

## Code modularization

- Duplicated logic across 2+ call sites → extract a custom hook or util.
- Generic helpers do not belong in feature folders. Promote to a shared module.
- Use indexed access types (`SomeType["field"]`) rather than restating a primitive in every signature.

## Inline single-use code, delete dead code

- A component or helper with one call site should usually be inlined.
- A function that no longer computes multiple things is usually no longer worth being a function.
- Remove clearly unused exports rather than leaving them "just in case."

## Comments

- Default: write none. Well-named identifiers carry the `what`.
- Add a short comment only when the `why` is non-obvious: a workaround, a hidden invariant, a subtle ordering constraint, a clever reduction.
- No JSDoc type annotations in `.ts`/`.tsx` files — the types are the types.
- Do not reference tickets, authors, or "added for X flow" — that rots. The PR description is the place for history.
