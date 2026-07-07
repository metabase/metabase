# CLJS TypeScript generator design update after comparing malli-ts

## Purpose

This memo compares Metabase's CLJS/Malli TypeScript declaration generator with [`flowyourmoney/malli-ts`](https://github.com/flowyourmoney/malli-ts). The goal is to borrow useful design ideas and coverage from `malli-ts` without turning the Metabase generator into a generic Malli-to-TypeScript library.

The Metabase generator should stay export-driven: CLJS exports and their Malli schemas are the source of truth. When the generator can't express a schema precisely, it should warn and keep emitting declarations.

## Summary recommendation

Use a hybrid approach.

Keep the current export-driven pipeline, but borrow `malli-ts` as a coverage checklist and as inspiration for clearer reference handling. Add missing TypeScript features only when the generator can implement them correctly from schema data or explicit TypeScript metadata.

Do not port `malli-ts` wholesale. Its generic schema-to-file model solves a different problem than Metabase's JS-facing export declarations.

## What Metabase should keep

The current generator has several strengths that `malli-ts` doesn't target:

- It starts from Shadow CLJS compiler state and JS-facing exports.
- It uses real CLJS arglists for exported function declarations.
- It supports multi-arity and variadic exported functions.
- It emits per-namespace `.d.ts` files and re-exports for the public JS API.
- It warns and falls back to `unknown` rather than blocking the build.
- It supports Metabase-specific schema hints like `:ts/object-of`, `:ts/array-of`, `:ts/key-transform`, `:ts/same-as`, and `:ts/generic-bound`.
- It extracts shared registry aliases for types used by multiple generated modules.

These are central to the project goal and shouldn't be replaced by `malli-ts`'s `parse-files` or `parse-ns-schemas` model.

## What malli-ts does well

`malli-ts` has a cleaner generic pipeline:

1. Walk a Malli schema into a TS-like AST.
2. Render that AST into TypeScript literals.
3. Track `$ref` definitions and file imports.
4. Generate files from explicit schema IDs.

Useful ideas from `malli-ts`:

- The schema traversal and string rendering are separate.
- References are represented explicitly as `$ref` nodes with definitions.
- Cross-file imports and aliases are tracked as structured data.
- Schema coverage is broad for common Malli primitives and predicates.
- Tests cover declarations, imports, references, aliases, external types, and JSDoc schema output.

The most useful idea for Metabase is not the full AST. It's the explicit treatment of schema references and the broader schema coverage matrix.

## Treat internal schema refs as data, not strings

Metabase needs better support for internal schema references. Generated TypeScript names like `Shared.Metabase_Lib_Schema_MbqlClause_Clause` should be rendering output, not source-of-truth metadata.

Current raw string hints such as:

```clojure
[:any {:typescript "Shared.Metabase_Lib_Schema_MbqlClause_Clause"}]
```

are brittle because they encode generated naming and shared-file placement by hand. They can break if naming, shared-type placement, or import strategy changes.

Prefer a structured internal reference hint, for example:

```clojure
[:any {:ts/ref ::lib.schema.mbql-clause/clause}]
```

or a container-specific form:

```clojure
[:any {:ts/array-of [:ts/ref ::lib.schema.mbql-clause/clause]}]
```

The exact syntax can be decided during implementation, but the design goal is clear:

- schema metadata names the Malli registry ref,
- the generator decides whether that ref is local, shared, imported, or expanded,
- generated TypeScript type names remain an implementation detail.

This is the strongest place to borrow from `malli-ts`: make references explicit and structured while preserving Metabase's existing shared-type behavior.

## Do not prioritize external imports yet

`malli-ts` has an `external-type` helper that can emit imported TypeScript types. That design is useful, but current Metabase usage doesn't justify making this a priority.

A quick scan shows few true external TypeScript types. Existing `:typescript` strings are mostly primitive overrides, `unknown`, `bigint`, one complex inline union, and one hardcoded generated shared alias.

External imports should stay a later opt-in feature, not the main reason to introduce a new rendering abstraction.

If needed later, use explicit metadata such as:

```clojure
[:any {:ts/type "Foo"
       :ts/import {:from "some-package"
                   :name "Foo"}}]
```

The generator should not infer imports from raw TypeScript strings.

## Compare Malli schema coverage

Metabase already covers the most important forms for exported APIs, including maps, vectors, sets, tuples, unions, intersections, enums, refs, function schemas, multi schemas, maybe schemas, repeated sequence schemas, and several Metabase-specific JS-facing hints.

`malli-ts` covers a wider set of basic Malli predicates and schema forms. Metabase should add the cheap, safe mappings that reduce weak `unknown` output.

### Add straightforward primitive and predicate mappings

Add mappings that cleanly collapse to TypeScript primitives:

```clojure
:number              ;; number
integer?            ;; number
decimal?            ;; number
pos? / neg? / zero? ;; number

ident?              ;; string
simple-ident?       ;; string
qualified-ident?    ;; string
simple-keyword?     ;; string
qualified-keyword?  ;; string
qualified-symbol?   ;; string
char?               ;; string
bytes?              ;; string

false?              ;; false
true?               ;; true

:qualified-keyword  ;; string
:qualified-symbol   ;; string
```

Map `inst?` according to Metabase runtime behavior. If JS consumers receive serialized dates, emit `string`; only emit `Date` if runtime evidence says consumers receive `Date` objects.

### Add safe refinement fallbacks

Comparator schemas mostly represent validation constraints that TypeScript can't express directly. They can still avoid unnecessary `unknown` output:

```clojure
:>   ;; number
:>=  ;; number
:<   ;; number
:<=  ;; number
```

For `:not` and `:not=`, don't pretend to model general negation. Emit `unknown` unless there is a simple literal case that TypeScript can express safely.

### Be careful with broad collection predicates

`malli-ts` maps broad predicates like `seqable?`, `list?`, `seq?`, `set?`, `coll?`, and `map?` to arrays or objects. Metabase should not copy these blindly.

Use runtime representation as the guide:

- `map?` can safely become `Record<string, unknown>` for JS-facing values.
- `vector?` can stay `unknown[]`.
- `set?` should only become `Set<unknown>` if JS consumers actually see JS `Set` values.
- `seqable?`, `list?`, and `seq?` should stay conservative unless the exported API consistently converts them to arrays.

## Add TypeScript features only when they are correct

This section lists TypeScript features worth adding because the generator can implement them from Malli schemas or explicit metadata.

### Add `:catn` names for standalone function types

Exported functions already use real CLJS arglists, which is better than `malli-ts`'s generated names. But standalone function schemas rendered through `schema->ts` can use names from `:catn`.

For example:

```clojure
[:=> [:catn [:a :string] [:b :int]] :boolean]
```

should render as:

```ts
(a: string, b: number) => boolean;
```

instead of:

```ts
(arg0: string, arg1: number) => boolean;
```

### Add optional parameter syntax when it is truly optional

For function parameters where Malli sequence semantics indicate an optional positional argument, prefer:

```ts
arg?: T
```

instead of:

```ts
arg: T | undefined;
```

Only do this when safe:

- the argument is a direct non-rest function parameter,
- optionality comes from sequence schema semantics like `:?`,
- required parameters don't follow the optional parameter,
- the schema isn't `[:maybe T]`.

Keep `[:maybe T]` as `T | null | undefined` in argument context because it describes nullable values, not just optional parameters.

### Add an explicit Promise helper

Do not infer async behavior from implementation. Add only an explicit hint:

```clojure
[:any {:ts/promise-of SomeSchema}]
```

which renders as:

```ts
Promise<SomeType>;
```

This covers a known TypeScript feature gap without relying on unsafe inference.

### Add explicit readonly support only if needed

Readonly isn't implied by Malli. If exported APIs need it, add opt-in metadata:

```clojure
[:map {:ts/readonly true} ...]
```

or:

```clojure
[:any {:ts/readonly-of SomeSchema}]
```

This can render `readonly` properties or `Readonly<T>`. Do not infer readonly from closed maps.

### Add explicit brands only if needed

Malli registry names often carry semantic meaning, but automatically branding every registry alias would be a major API change.

If nominal types become useful, make them opt-in:

```clojure
[:string {:ts/brand "UserId"}]
```

which renders as:

```ts
type UserId = string & { readonly __brand: "UserId" };
```

This is safe only when explicitly requested.

### Extend tuple and rest precision where schema semantics are clear

Metabase already handles tuple-like output for some sequence minimum counts, such as `:sequential`, `:+`, and `:repeat`.

Keep extending this only where Malli semantics and JS runtime representation are clear. Avoid translating general seqex schemas into precise tuple types if exported values aren't reliably arrays.

## Do not implement these automatically

These features require information Malli schemas don't provide or aren't representable in normal TypeScript declarations:

- inferring `Promise<T>` from function bodies,
- inferring `readonly` from Malli maps,
- branding registry aliases automatically,
- encoding numeric ranges as TypeScript types,
- encoding arbitrary regexes as template literal types,
- representing general `:not` precisely,
- inferring imports from raw `:typescript` strings,
- replacing the current generator with a full `malli-ts`-style AST rewrite.

## Updated priority list

| Recommendation                                                     | Priority   | Confidence      |
| ------------------------------------------------------------------ | ---------- | --------------- |
| Add missing primitive and predicate mappings                       | High       | High            |
| Add safe comparator/refinement fallbacks                           | High       | High            |
| Replace hardcoded generated TS names with structured internal refs | High       | High            |
| Audit and document registry-ref/shared-type behavior               | High       | High            |
| Use `:catn` names for standalone function types                    | Medium     | High            |
| Add optional parameter syntax for true optional args               | Medium     | Medium          |
| Add explicit `:ts/promise-of`                                      | Medium     | High            |
| Extend tuple/rest precision carefully                              | Medium     | Medium          |
| Add explicit readonly helper                                       | Low/medium | High if opt-in  |
| Add explicit brand helper                                          | Low/medium | High if opt-in  |
| Add structured external imports                                    | Low        | High if opt-in  |
| Add multiple explicit generic parameters                           | Low        | Medium          |
| Full AST rewrite                                                   | Low        | Not recommended |

## Proposed next step

Before implementation, write a focused plan that starts with the safest changes:

1. Add missing primitive and predicate mappings.
2. Add structured internal schema refs so generated TypeScript names aren't used as metadata.
3. Add tests that compare Metabase coverage against `malli-ts` coverage for common Malli forms.
4. Add targeted opt-in TypeScript helpers only where exported APIs need them.

This sequence improves coverage and removes brittle generated-name strings without taking on a large architecture rewrite.
