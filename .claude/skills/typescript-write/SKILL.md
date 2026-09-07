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
- **No return-only generics.** A type parameter must relate types — it should appear at least twice in the signature (parameters, return, or constraints). `get<T>(): T` is a disguised cast that fakes type safety; use `unknown` and narrow at the call site instead.
- **Mandatory type verification.** Before finishing a TS/TSX change, run `bun run type-check-pure`. If TypeScript LSP tools are available, also inspect changed symbols with hover and go-to-definition; otherwise skip LSP check.

## Type tightening

- **Avoid type casts and loose `unknown`** — fix the signature instead.
- **If a function only needs one field of a wide object, accept that field** — not the wide object. The cast often disappears once the signature is right.
- **Reach for `Partial<T>`, `Pick<T, K>`, `Record<K, V>`, and generics** before reaching for a cast.
- **Prefer `Record` with a union key type or `Map` over string index signatures** (`{[key: string]: T}`) — index signatures erode type safety the way `any` does.
- **Prefer making props/components generic** (`<T>`) when a value flows through unchanged and the caller knows the type.
- **Prefer `unknown` over loose typing** and narrow before use — an `unknown` value forces a guard at the point of use.
- **`satisfies` for object literals** that must conform without widening (config objects, lookup maps, discriminated literals) — better than `: T` (widens) or `as T` (unsafe).
- **Avoid non-null assertions (`!`)**. Prefer a guard, early return, or `?.`. Use `!` only when non-nullness is provably true and localized, with a comment.
- **Indexed lookups can miss at runtime.** `arr[i]` and `record[key]` are typed `T` (the project doesn't enable `noUncheckedIndexedAccess`) — guard lookups that may miss. Iterate objects with `Object.entries`; a `keyof` assertion in `for-in` requires statically known keys and a justification.
- **No redundant runtime coercion** — don't wrap already-typed values in `Number()` / `String()` / `Boolean()`.
- **Type guards belong in `frontend/src/metabase-types/guards/`**. Do not redefine them locally.
- **Contain a truly unavoidable unsafe cast** inside one small function with a correct signature and unit tests — never let it leak into callers' types, and never loosen a function's declared signature to silence errors in its implementation.
- **A cast you can't avoid needs a real justification comment** stating why it's safe — the `metabase/no-unjustified-type-casts` rule accepts any preceding comment. NEVER copy the legacy `// Unjustified type cast. FIXME` placeholder; it only marks pre-rule debt and copying it sneaks an unjustified cast past the linter. If you can't articulate why the cast is correct, the cast is wrong — fix the types.

## Type modeling

- **API layer and generated OpenAPI types.** When adding or changing RTK Query endpoints, editing request/response types in `metabase-types/api`, or migrating endpoints to auto-generated OpenAPI types, first read [`openapi-generated-types.md`](./openapi-generated-types.md) — it defines the alias-layer migration procedure and the schema-first debugging order.
- **Reuse existing types; don't re-declare them.** Use canonical IDs and domain entity types from `metabase-types/api` (`FieldId`, `TableId`, `ConcreteTableId`, `SchemaName`, …) and key data structures by them (`new Map<ConcreteTableId, …>()`). Don't duplicate generated/API types — compose or derive (`Pick`, `Omit`, indexed access `SomeType["field"]`, `ReturnType`).
- **Use generics to let TypeScript infer types** in reusable functions and components. Complex generics are fine when they derive types automatically instead of forcing manual narrowing — but prefer an imprecise honest type over a precise wrong one. If you can't model something accurately, use a simpler type or `unknown` rather than a complex type that lies.
- **Model the actual data contract; keep types narrow.** Optional `field?: T` for a key that may be absent, `field: T | undefined` only when the key is always present but the value may be undefined, `| null` for explicit API nulls. Prefer domain unions over broad `string` / `number` / loose `Record`. Refer to the API endpoint implementation for the actual shape and nullability — and when tempted to cast, first check whether the type should be refined to match reality.
- **No sentinel values.** Don't encode special states as `-1`, `""`, or `0` — they type-check everywhere a regular value does. Use `null`/`undefined`, or a tagged-union variant when the meaning needs a name.
- **Think twice before `field?:`.** Optional properties hide missing-value bugs and breed scattered, inconsistent defaulting. Prefer required fields; normalize loose input into a fully populated type at the boundary. Avoid a combinatorial explosion of independent options.
- **Make nullability atomic.** When several fields are absent together, make the containing object nullable (or a separate union variant) instead of many independently nullable fields whose validity is implicitly linked.
- **Discriminated unions for variant state, with exhaustive checks.** Model "one of N shapes" as a union with a literal discriminant rather than a bag of optional fields, and exhaust it with ts-pattern's `.exhaustive()` so adding a variant becomes a compile error:
  ```ts
  const result = match(state)
    .with({ type: "error", error: P.select() }, (error) => <Error message={error.message} />)
    .with({ type: "success", data: P.select() }, (data) => <Content data={data} />)
    .exhaustive(); // Compile-time guarantee all cases handled
  ```
- **Derive union types from constants** (`as const` + `typeof`/`keyof`) so the type and the values can't drift. Don't use `enum`, parameter properties, or namespaces — prefer plain ECMAScript constructs over TypeScript-only runtime features.
- **`readonly` / immutability where mutation isn't intended** — component props, shared constants, exported config, unmutated parameters. Prefer `readonly T[]` / `ReadonlyArray<T>` for inputs you don't mutate; never mutate parameters — it breaks the caller's narrowing.
- **Build objects in one expression** — object spread plus conditional spread (`...(cond ? { x } : {})`) — rather than declaring loose and mutating properties in, which forces widened types or casts.
- **Treat `metabase-lib` opaque types as black boxes.** Types like `Lib.Query` are branded on purpose; go through `metabase-lib` functions, never cast into their internals.
- **Type async and error states explicitly** (a discriminated union or the data-layer's typed result) — never leave loading/error/empty implicit.

## Function signatures

- **Annotate signatures, let locals infer.** Parameter and return types belong on exported/shared functions; don't clutter bodies with annotations TypeScript infers. Do annotate an object literal's type when you want excess-property checking and errors at the declaration rather than at first use.
- **Accept broadly, return strictly.** Optional and union types are fine in parameters but awkward in return types — don't make callers unpick a union or optional you could have narrowed before returning.
- **Avoid consecutive parameters of the same type** — swapped arguments still type-check. Use an options object for same-type neighbors or 3+ parameters.
- **Prefer `async`/`await` over raw promise chains and callbacks** — better inference, flow, and error handling. Declare Promise-returning functions `async`.

## Null and undefined

- **Narrow at the source**. If a value is optional only in a corner case, don't thread `undefined` through every layer — guard at the producer.
- **Sensible defaults for optional values**. Use `?.` and `??` at the consumer.
- **Filter lists before iterating** — e.g. `.filter(isNotNull)` before `.map`.
- **Avoid non-strict null comparisons** (`X != null`) when `X` can never be `null` — use a strict check or narrow the type. Use `checkNotNull` / `isNotNull` from `metabase/utils/types` where appropriate.

## Naming

- **Names describe the entity, not the mechanism**. A name must reflect what the value holds.
- **Align sibling concepts**: keep verb conventions consistent across a related API.
- **No names that encode implementation history** rather than current meaning. Suffixes like `Base`, `New`, `Old`, `Initial` need a real semantic distinction, otherwise drop them.
- **Avoid vague type names** (`Info`, `Data`, `Entity` suffixes) — use the problem domain's own vocabulary, and name types for what they are, not their shape.
- **Include units when the type doesn't carry them** (`timeoutMs`, `widthPx`, `temperatureC`).
- **Avoid cryptic identifiers** (`v`, `n`, `$n`) for domain values; short names are fine only in tiny conventional contexts (loop index `i`, coordinates `x`/`y`, generic params `T`/`K`/`V`).

## Code structure and organization

- **Prioritize reusability over duplication**. The codebase already has many utility functions — leverage them. If you introduce duplicated logic, extract it to a shared utility.
- **Generic helpers do not belong in feature folders**. Promote to a shared utility.
- **Keep functions small and single-purpose**. A 100+ line function is hard to review — split into focused named helpers, each with one responsibility and a minimal dependency surface. When necessary, cover with unit tests.
- **Extract distinct complex JSX into named components**. Choose same-file vs separate-file by reuse, coupling, testability, and readability.

## Comments

- **No comments by default**. Well-named identifiers carry the `what`.
- **Comments should be concise**. Add a short comment only when the `why` is non-obvious: a workaround, a hidden invariant, a subtle ordering constraint, a clever reduction. Never document the implementation or restate type information the annotations already carry — focus on intent.

## Verify before done

- **Run the project type-check** when finished (see the shared TypeScript commands above).
