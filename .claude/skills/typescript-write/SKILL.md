---
name: typescript-write
description: Write TypeScript and JavaScript code following Metabase coding standards and best practices. Use when developing or refactoring TypeScript/JavaScript code.
---

# TypeScript/JavaScript Development Skill

@./../_shared/development-workflow.md
@./../_shared/typescript-commands.md
@./../_shared/react-redux-patterns.md

## Requirements

- New code must not introduce explicit or inferred `any`. Do not use `as any` or double assertions through `unknown`.
- Give external values a supported boundary type, or use `unknown` and validate before use. Do not let untyped values propagate into application code.
- Keep declarations consistent with actual data and behaviour. Do not weaken signatures, invent defaults, or assert unsupported guarantees to silence errors.

The decisions below are contextual guidance. Follow their stated conditions instead of treating every preference as a ban.

## Modelling decisions

### Optional and nullable fields

- Check the API implementation when defining or refining a wire type.
- Use `field?: T` for a key that may be absent, `field: T | undefined` for a required key whose value may be undefined, and `| null` for explicit nulls.
- For internal state, group fields that become absent together into a nullable object or discriminated union. Preserve the actual shape in raw API declarations.
- Supply defaults only when they have a defined application meaning. Narrow uncertainty at its source where possible.
- Filter nullable list elements when missing entries should be discarded. Preserve absence and positions when they carry meaning.

### Variants and special states

- Represent mutually exclusive states with a discriminated union. Include loading, error and empty states where relevant, and check variants exhaustively with `ts-pattern` when handling them.
- Derive union types from constants with `as const` and `typeof`/`keyof` when both describe the same values.
- When designing a format, prefer explicit states over sentinel values that hide meaning. Preserve existing protocol sentinels or convert them at a deliberate boundary.

### Dictionaries and lookups

- Use a finite key union when the keys are known. Use an index signature, `Record<string, T>`, or `Map` for open dictionaries.
- Guard lookups that may miss, even when their inferred type omits `undefined`. `Record<string, T>` has the same missing-key issue as a string index signature.
- Use iteration that preserves key/value relationships. Only assert `keyof` when the runtime keys are known to belong to the declared type.

### Generics and inference

- Use generics to express real relationships between values. Generic props or components are useful when the caller knows the type and values flow through unchanged.
- Judge whether the implementation can produce its promised result. A caller-selected `T` does not establish the type of unvalidated external data; accept a validator or return `unknown` for narrowing.
- A generic factory can safely produce an empty collection without accepting a `T`:

  ```ts
  function empty<T>(): T[] {
    return [];
  }
  ```

- Prefer a simpler honest type when a complex type cannot represent the behaviour accurately.
- Use `satisfies` to check an expression against a shape while retaining its inferred type, or an annotation when the declared type should be explicit.

## Assertions and narrowing

- Check whether an inaccurate declaration or an overly broad function input caused the need for a cast. Prefer narrowing or deriving types with `Pick`, `Omit`, indexed access and other appropriate utilities.
- Keep unavoidable assertions local. Extract a repeated or complex assertion when a helper makes its invariant easier to enforce, and test nontrivial runtime assumptions that justify it.
- An unavoidable cast needs a comment explaining why it is safe, as required by `metabase/no-unjustified-type-casts`. Never copy the legacy `Unjustified type cast. FIXME` placeholder.
- Prefer a guard, early return or optional chaining to a non-null assertion. Use `!` only when non-nullness is established locally and explain why.
- Use `checkNotNull` where appropriate. Avoid loose null comparisons when the value cannot be null.
- Do not add `Number()`, `String()` or `Boolean()` coercions around values already known to have that type.

## Function signatures and object construction

- Make shared and public contracts explicit where annotations improve stability or clarity. Let local values infer.
- Accept the data the operation needs. If it only needs one field, accept that field rather than the containing object.
- Return the most precise honest result. Narrow avoidable uncertainty inside the function, but retain meaningful nullability and variants.
- Use named options when positional arguments are easy to confuse, particularly adjacent arguments with the same type.
- Use `async`/`await` when it clarifies control flow or error handling. Returning an existing promise directly is also valid.
- Prefer readonly inputs when the function does not mutate them. Make intentional mutation of caller-owned data explicit.
- Prefer complete object expressions when they avoid partially initialised state or assertions. Incremental construction is fine when clearer and type-correct.

## Repository conventions

- Reuse canonical IDs and domain types from `metabase-types/api`, such as `FieldId`, `TableId`, `ConcreteTableId` and `SchemaName`. Compose or derive compatible types instead of duplicating declarations.
- Put type guards in `frontend/src/metabase-types/guards/` and reuse existing ones.
- Use `metabase-lib` functions to work with opaque types such as `Lib.Query`. Do not cast into their internal representation.
- Use domain names and include units where useful (`timeoutMs`, `widthPx`). Replace vague names when they obscure meaning, while retaining clear established terminology.
- Align sibling names. Avoid names that encode implementation history and cryptic identifiers outside small conventional contexts.
- Reuse existing utilities. Extract duplicated logic when it represents the same reusable operation, and place generic helpers in shared locations.
- Keep functions focused. Split distinct responsibilities into named helpers, and extract complex JSX into components according to ownership and reuse.
- Default to no comments. Explain only non-obvious intent, invariants or constraints that names and types do not express.

## Verification

- Run `bun run type-check-pure` after TS/TSX changes. Use TypeScript LSP tools to inspect changed symbols when available.
- Run the relevant lint, formatting and tests using the shared command guide above.
- Test behaviour and runtime assumptions, particularly where external data can violate declarations. A type check does not replace runtime validation.
