---
name: typescript-write
description: Write TypeScript and JavaScript code following Metabase coding standards and best practices. Use when developing or refactoring TypeScript/JavaScript code.
---

# TypeScript/JavaScript Development Skill

@./../_shared/development-workflow.md
@./../_shared/typescript-commands.md
@./../_shared/react-redux-patterns.md

## No `any` — hard rule

- **New code must not introduce `any`, explicit or implicit.** No `any` annotations, no `as any` / `as unknown as`, no untyped parameters or returns that infer `any`, no implicitly-`any` destructures or array/object literals.
- **Untyped third-party / boundary values** must be typed at the boundary (a declared type, `unknown` + type guard, or a small typed wrapper) — never let `any` propagate inward.
- **Mandatory LSP verification.** After writing or editing any TS/TSX, inspect the changed symbols with the TypeScript Language Server (hover to read inferred types; `goToDefinition` to confirm sources) and run the project type-check.

## Type tightening

- **Avoid type casts and loose `unknown`** — fix the signature instead.
- **If a function only needs one field of a wide object, accept that field** — not the wide object. The cast often disappears once the signature is right.
- **Reach for `Partial<T>`, `Pick<T, K>`, `Record<K, V>`, and generics** before reaching for a cast.
- **Prefer making props/components generic** (`<T>`) when a value flows through unchanged and the caller knows the type.
- **Prefer `unknown` over loose typing** and narrow before use — an `unknown` value forces a guard at the point of use.
- **`satisfies` for object literals** that must conform without widening (config objects, lookup maps, discriminated literals) — better than `: T` (widens) or `as T` (unsafe).
- **Avoid non-null assertions (`!`)**. Prefer a guard, early return, or `?.`. Use `!` only when non-nullness is provably true and localized, with a comment.
- **No redundant runtime coercion** — don't wrap already-typed values in `Number()` / `String()` / `Boolean()`.
- **Type guards belong in `frontend/src/metabase-types/guards/`**. Do not redefine them locally.

## Type modeling

- **Reuse existing types; don't re-declare them.** Use canonical IDs and domain entity types from `metabase-types/api` (`FieldId`, `TableId`, `ConcreteTableId`, `SchemaName`, …) and key data structures by them (`new Map<ConcreteTableId, …>()`). Don't duplicate generated/API types — compose or derive (`Pick`, `Omit`, indexed access `SomeType["field"]`, `ReturnType`).
- **Use generics to allow TypeScript to infer correct types** when creating functions and components that need to be reusable and type-safe. Don't hesitate to introduce complex generics if they allow to derive types automatically instead of manual narrowing.
- **Model the actual data contract; keep types narrow.** Optional `field?: T` for a key that may be absent, `field: T | undefined` only when the key is always present but the value may be undefined, `| null` for explicit API nulls. Prefer domain unions over broad `string` / `number` / loose `Record`.
- **Refer to API implementation** when defining or refining types to ensure they match the actual data structure. When considering a type cast, first consider if the type should be refined to match the actual data structure.
- **Discriminated unions for variant state, with exhaustive checks.** Model "one of N shapes" as a union with a literal discriminant rather than a bag of optional fields, and exhaust it with ts-pattern's `.exhaustive()` so adding a variant becomes a compile error:
  ```ts
  import { match } from "ts-pattern";

  const result = match(status)
    .with({ type: "loading" }, () => <Spinner />)
    .with({ type: "error", error: P.select() }, (error) => <Error message={error.message} />)
    .with({ type: "success", data: P.select() }, (data) => <Content data={data} />)
    .exhaustive(); // Compile-time guarantee all cases handled
  ```
- **Derive union types from constants** (`as const` + `typeof`/`keyof`) so the type and the values can't drift.
- **`readonly` / immutability where mutation isn't intended** — component props, shared constants, exported config. Prefer `readonly T[]` / `ReadonlyArray<T>` for inputs you don't mutate.
- **Type async and error states explicitly** (a discriminated union or the data-layer's typed result) — never leave loading/error/empty implicit.

## Null and undefined

- **Narrow at the source**. If a value is optional only in a corner case, don't thread `undefined` through every layer — guard at the producer.
- **Sensible defaults for optional values**. Use `?.` and `??` at the consumer.
- **Lists should be filtered** before being used in a map or other iteration.
- **Avoid non-strict null comparisons** (`X != null`) when `X` can never be `null` — use a strict check or narrow the type. Use `checkNotNull` where necessary.
- **Check actual nullability against API implementation**. Find the API endpoint implementation and check if the field can actually be null.

## Naming

- **Names describe the entity, not the mechanism**. A name must reflect what the value holds.
- **Align sibling concepts**: keep verb conventions consistent across a related API.
- **No names that encode implementation history** rather than current meaning. Suffixes like `Base`, `New`, `Old`, `Initial` need a real semantic distinction, otherwise drop them.
- **Avoid cryptic identifiers** (`v`, `n`, `$n`) for domain values; short names are fine only in tiny conventional contexts (loop index `i`, coordinates `x`/`y`, generic params `T`/`K`/`V`).

## Code structure and organization

- **Prioritize reusability over duplication**. The codebase already has many utility functions — leverage them. If you introduce duplicated logic, extract it to a shared utility.
- **Generic helpers do not belong in feature folders**. Promote to a shared utility.
- **Keep functions small and single-purpose**. A 100+ line function is hard to review — split into focused named helpers, each with one responsibility and a minimal dependency surface. When necessary, cover with unit tests.
- **Extract distinct complex JSX into named components**. Choose same-file vs separate-file by reuse, coupling, testability, and readability.

## Comments

- **No comments by default**. Well-named identifiers carry the `what`.
- **Comments should be concise**. Add a short, concise comment only when the `why` is non-obvious: a workaround, a hidden invariant, a subtle ordering constraint, a clever reduction. Never document the actual implementation, focus on the intent and the why.

## TypeScript Migration

**When touching existing JavaScript files, propose to convert them to TypeScript first**. Create a separate PR for the conversion, then implement the changes.

## Verify before done

- **Run the project type-check** when finished (see the shared TypeScript commands above).
