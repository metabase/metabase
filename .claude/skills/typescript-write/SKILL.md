---
name: typescript-write
description: Write or modify TypeScript and JavaScript code, including tests and test helpers, following Metabase coding standards. Use before editing any TS/TSX/JS/JSX file.
---

# TypeScript/JavaScript Development Skill

Before frontend edits, including test-only changes, read `frontend/CLAUDE.md`, `docs/developers-guide/frontend.md`, and the shared references below. For new or edited tests, follow [Test authoring](#test-authoring).

@./../_shared/development-workflow.md
@./../_shared/typescript-commands.md
@./../_shared/react-redux-patterns.md

## No `any` — hard rule

- **New, moved, or otherwise edited code must not contain `any`, explicit or implicit.** No `any` annotations, no `as any` / `as unknown as`, no untyped parameters or returns that infer `any`, no implicitly-`any` destructures or array/object literals.
- **Stop untyped values at the boundary.** Use canonical types, typed wrappers, or `unknown` with validation or narrowing. Check library defaults and inferred types: a passing type-check does not guarantee that `any` hasn't propagated into your code. For example, capture untyped `JSON.parse` and response `.json()` results as `unknown`; narrow or validate before accessing fields or passing to typed callers.
- **Type the captured value, not only its eventual result.** A return annotation doesn't change the inferred types of parameters or destructured bindings. Capture untyped data as `unknown`, then narrow or validate before destructuring or accessing fields.
- **Mandatory type verification.** Before finishing a TS/TSX change, run `bun run type-check-pure`. If TypeScript LSP tools are available, also inspect changed symbols with hover and go-to-definition; otherwise skip LSP check.

## Type tightening

- **Avoid type casts and loose `unknown`** — fix the signature instead.
- **If a function only needs one field of a wide object, accept that field** — not the wide object. The cast often disappears once the signature is right.
- **Reach for `Partial<T>`, `Pick<T, K>`, `Record<K, V>`, and generics** before reaching for a cast.
- **Match dictionary keys to the data.** Use a finite key union when the keys are known. Open dictionaries can use an index signature, `Record<string, T>`, or `Map`; index signatures still constrain values, and changing their spelling to `Record<string, T>` does not make missing-key access safe.
- **Prefer making props/components generic** (`<T>`) when a value flows through unchanged and the caller knows the type.
- **Prefer `unknown` over loose typing** and narrow before use — an `unknown` value forces a guard at the point of use.
- **`satisfies` for object literals** that must conform without widening (config objects, lookup maps, discriminated literals) — better than `: T` (widens) or `as T` (unsafe).
- **Avoid non-null assertions (`!`)**. Prefer a guard, early return, or `?.`. Use `!` only when non-nullness is provably true and localized, with a comment.
- **Guard indexed lookups that may miss.** Arrays and dictionaries can return `undefined` even when the inferred type omits it. Use an iteration form that preserves the key/value relationship, and only assert `keyof` when the runtime keys are known to belong to the declared type.
- **No redundant runtime coercion** — don't wrap already-typed values in `Number()` / `String()` / `Boolean()`.
- **Type guards belong in `frontend/src/metabase-types/guards/`**. Do not redefine them locally.
- **A cast you can't avoid needs a real justification comment.** The `metabase/no-unjustified-type-casts` rule accepts any preceding comment — state the actual reason the cast is safe. NEVER write the legacy `// Unjustified type cast. FIXME` placeholder; it exists only on casts that predated the rule, and copying it sneaks an unjustified cast past the linter. If you can't articulate why the cast is correct, the cast is wrong — fix the types.
- **Keep unavoidable assertions local.** Isolate a repeated or complex assertion behind a helper when that makes its invariant easier to enforce. Test nontrivial runtime assumptions that justify it; a trivial assertion does not automatically need a new helper or test. Do not weaken a public signature just to silence implementation errors.

## Type modeling

- **Reuse existing types; don't re-declare them.** Use canonical IDs and domain entity types from `metabase-types/api` (`FieldId`, `TableId`, `ConcreteTableId`, `SchemaName`, …) and key data structures by them (`new Map<ConcreteTableId, …>()`). Don't duplicate generated/API types — compose or derive (`Pick`, `Omit`, indexed access `SomeType["field"]`, `ReturnType`). Search for the canonical declaration before introducing a local domain shape. If a type isn't exported directly, derive it from the owning function, endpoint, or hook rather than recreating its shape.
- **Generics must make promises the implementation can keep.** A caller-selected `get<T>(): T` must not disguise an unchecked assertion about external data. Return `unknown` and validate, or accept a validator that establishes `T`. A factory such as `function empty<T>(): T[] { return []; }` is valid; judge the implementation, not how often `T` appears in the signature.
- **Prefer an honest type over false precision.** Use generics when they express a real relationship. If a complex type cannot model the behaviour accurately, choose a simpler type or `unknown` with narrowing instead of asserting an unsupported guarantee.
- **Model the actual data contract; keep types narrow.** Optional `field?: T` for a key that may be absent, `field: T | undefined` only when the key is always present but the value may be undefined, `| null` for explicit API nulls. Prefer domain unions over broad `string` / `number` / loose `Record`.
- **Refer to API implementation** when defining or refining types to ensure they match the actual data structure. When considering a type cast, first consider if the type should be refined to match the actual data structure.
- **Optionality must reflect absence.** Keep required fields required and optional fields optional. Normalise input when the application has a meaningful default, not merely to remove a type error. Preserve the actual wire shape in API types.
- **Represent related absence together when modelling internal state.** If several fields exist or disappear together, consider a nullable containing object or a discriminated union. Do not reshape a raw API declaration unless the data actually has that shape.
- **Prefer explicit special states when designing a format.** Use nullability or named union variants when sentinel values such as `-1` hide meaning. Preserve established protocol sentinel values unless the behaviour is deliberately changed, or normalise them at an explicit boundary.
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
- **`readonly` / immutability where mutation isn't intended** — component props, shared constants, exported config, and unmutated parameters. Prefer `readonly T[]` / `ReadonlyArray<T>` for inputs you don't mutate. Functions that mutate caller-owned data should make that behaviour explicit.
- **Construct complete, well-typed objects where practical.** Prefer an object expression when it avoids partially initialised state or assertions. Incremental construction is fine when it is clearer and maintains the type's invariants.
- **Treat `metabase-lib` opaque types as black boxes.** Use `metabase-lib` functions to work with types such as `Lib.Query`, rather than casting into their internal representation.
- **Type async and error states explicitly** (a discriminated union or the data-layer's typed result) — never leave loading/error/empty implicit.

## Function signatures

- **Make public contracts explicit where it improves stability and clarity.** Annotate parameters and return types at shared boundaries when useful; let local values infer. Use `satisfies` or an annotation when a declaration needs an explicit shape check.
- **Accept the inputs the operation supports and return the most precise honest result.** Narrow avoidable uncertainty inside the function, but preserve meaningful nullability and union variants in its return type.
- **Use named options when positional arguments are easy to confuse.** Consecutive arguments with the same type are a useful warning sign, not an automatic requirement to rewrite a clear API.
- **Use `async`/`await` when it clarifies control flow or error handling.** Returning an existing promise directly is also valid; a Promise return type alone does not require adding `async`.

## Null and undefined

- **Narrow at the source**. If a value is optional only in a corner case, don't thread `undefined` through every layer — guard at the producer.
- **Sensible defaults for optional values**. Use `?.` and `??` at the consumer.
- **Narrow nullable list elements when the operation requires present values.** Filter with a type guard when missing entries should be discarded; preserve them when their absence or position carries meaning.
- **Avoid non-strict null comparisons** (`X != null`) when `X` can never be `null` — use a strict check or narrow the type. Use `checkNotNull` where necessary.
- **Check actual nullability against API implementation**. Find the API endpoint implementation and check if the field can actually be null.

## Naming

- **Names describe the entity, not the mechanism**. A name must reflect what the value holds.
- **Use domain vocabulary and include units where useful** (`timeoutMs`, `widthPx`, `temperatureC`). Prefer a more specific name when `Info`, `Data`, or `Entity` obscures the meaning, while keeping established terminology when it is clear.
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

## Test authoring

Tests should verify expected user-visible behavior or the public contract of a function or component, not its internal implementation. A refactor that preserves that contract should not break the tests.

For new or edited tests, including Jest and Cypress:

1. **Identify the expected contract.** Start from the requirements: what should the user or caller observe? Read the relevant source to understand setup prerequisites and execution paths, not to treat the current implementation as the definition of correct behavior.
2. **Set up realistic fixtures.** Supply the props, state, mocked data, and providers needed to reach the behavior under test. Data in a mocked endpoint doesn't satisfy a condition on a component prop.
3. **Plan coverage.** Identify each case's prerequisites, actions, and observable outcomes. For complex scenarios, a short case map can help organize coverage.
4. **Write the tests** following the rules below.
5. **Review the finished changes** using [Verify before done](#verify-before-done), including whether each test exercises the behavior it claims.
6. **Summarize the outcome.** Briefly describe the coverage added and any unresolved issues or checks that didn't run. Follow the user's requested response format.

- **Use the frontend guide's [setup pattern](../../../docs/developers-guide/frontend.md#setup-pattern).** New, moved, or otherwise edited parameterized unit/component setup functions take named options typed as `SetupOpts`, rather than positional selections or booleans.
- **Keep mocks typed against their real contracts.** Prefer importing the function and using `jest.mocked` for a mocked export. With `jest.requireMock`, supply `typeof import("module-path")` only if the mock preserves that export contract. Give `jest.fn` callbacks a typed implementation or explicit argument/return types matching the real callback; bare `jest.fn()` defaults to `any`.
- **Type fixtures against the owning contract.** Use canonical response types for mock data and deferred promises. Deriving a type from the fixture itself doesn't establish compatibility with the API. Apply the boundary rule to parsed or intercepted request/response bodies: capture untyped results as `unknown` before using them, including in assertions. Comparing an `unknown` value with an independent expected object doesn't require narrowing it.
- **Reuse test infrastructure.** Search shared test support before adding providers, server mocks, or async helpers. Use shared [server-mock helpers](../../../docs/developers-guide/frontend.md#request-mocking) for endpoints and, when suitable, `defer<T>()` from `metabase/utils/promise` for controlled async completion. Preserve other callers when extending shared helpers.
- **Exercise what the test claims.** Repeat actions to test repetition. When checking pending behavior or ordering, control async completion and assert at the relevant intermediate states, not only after everything settles. Check expected effects and the absence of unwanted effects relevant to the contract. If call counts matter, assert them as well as arguments; `toHaveBeenCalledWith` permits extra calls. Before testing a retry, wait for the failure to become observable.
- **Assert observable outcomes.** Check rendered behavior, return values, or externally observable effects required by the contract. Assert callback arguments, call counts, or ordering only when they are part of that contract, not to mirror internal helper calls or component state. Reuse the applicable testing conventions rather than copying a nearby assertion blindly.
- **Challenge the assertions.** If the expected behavior were missing or wrong, would this test fail? For multi-step interactions, verify the observable transition between steps—not just the final state.
- **Preserve the intended coverage when repairing a test.** Correct an ambiguous selector or faulty setup without dropping the behavior the test was meant to exercise. If the assertion itself misstates the expected contract, correct it against the requirements; don't weaken it merely to match the current implementation.

## Verify before done

- **Run the project type-check** when finished (see the shared TypeScript commands above).
- **Review the finished changes.** Use `typescript-review` to check the full diff and new files, including tests and helpers, against the applicable guidelines. Passing tests, lint, and type-checking don't establish guideline compliance.
