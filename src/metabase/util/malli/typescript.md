# TypeScript Generation from Malli Schemas

Metabase automatically generates TypeScript declaration files (`.d.ts`) from Malli schemas attached to ClojureScript vars. This bridges the CLJS `metabase.lib.*` APIs and the TypeScript frontend, so frontend wrappers can use backend-derived types instead of handwritten approximations.

The generator lives in:

```text
src/metabase/util/malli/typescript.clj
```

It runs as a `shadow-cljs` build hook at the `:flush` stage, after CLJS compilation has produced analyzer metadata.

## Pipeline overview

At build time the generator:

1. Reads CLJS namespaces from the shadow compiler state.
2. Finds vars with Malli schema metadata, usually from `mu/defn`.
3. Resolves schemas, registry refs, function arities, and TS-specific metadata.
4. Converts Malli schemas to TypeScript strings.
5. Emits one `.d.ts` file per namespace under `target/cljs_dev`.
6. Emits shared registry types into `metabase.lib.shared.d.ts` when a schema ref is reused across namespaces.
7. Emits re-exports from `metabase.lib.js.d.ts` for other `metabase.*` modules.

## Two-pass architecture

### Pass 1 — reference collection

The first pass walks schemas without generating final output. It records qualified registry refs, such as:

```clojure
::lib.schema.metadata/column
::lib.schema/query
```

Refs used by multiple namespaces are promoted to shared declarations.

### Pass 2 — declaration generation

The second pass emits:

- namespace-local type aliases,
- shared type imports,
- function declarations,
- constant declarations,
- fallback declarations for schemas that cannot be fully evaluated during JVM-side generation.

Shared refs are emitted as:

```ts
import type * as Shared from "./metabase.lib.shared";
```

and referenced as:

```ts
Shared.Metabase_Lib_Schema_Metadata_Column
```

## Registry ref naming

A registry keyword like:

```clojure
:metabase.lib.schema.metadata/column
```

becomes:

```ts
Metabase_Lib_Schema_Metadata_Column
```

Rules:

- namespace segments are converted to `CapitalCase` and joined with `_`,
- the schema name is converted to `CapitalCase`,
- special characters are transliterated where needed.

## Core schema-to-TypeScript mappings

| Malli schema | TypeScript output |
|---|---|
| `:string`, `:keyword`, `:symbol`, `:uuid`, `:uri`, `:re` | `string` |
| `:time/local-date`, `:time/local-time`, `:time/local-date-time`, offset/zoned time schemas | `string` |
| `:int`, `:double`, `number?`, `int?`, `pos-int?`, `nat-int?`, `neg-int?` | `number` |
| `:boolean`, `boolean?` | `boolean` |
| `:nil` | `null` |
| `:any` | `unknown`, unless TS metadata overrides it |
| `[:maybe X]` in return position | `X \| null` |
| `[:maybe X]` in argument position | `X \| undefined \| null` |
| `[:sequential X]`, `[:vector X]` | `X[]` |
| `[:sequential {:min 1} X]` | `[X, ...X[]]` |
| `[:set X]` | `Set<X>` |
| `[:map [:key Type] ...]` | `{ key: Type; ... }` |
| open `:map` with entries | known keys plus `[key: string]: unknown` |
| empty open `:map` | `Record<string, unknown>` |
| closed empty `:map` | `{}` |
| `[:map-of K V]` | `Record<normalized-key, V>` |
| `[:map-of [:enum ...] V]` | `Partial<Record<literal-union, V>>` |
| `[:enum "a" "b"]` | `"a" \| "b"` |
| `[:or A B]` | `A \| B` |
| `[:and A B]` | `A & B`, with unknown branches dropped when safe |
| `[:merge A B]` | `A & B`, with unknown branches dropped when safe |
| `[:tuple A B]` | `[A, B]` |
| `[:cat A B]`, `[:catn ...]` | `[A, B]` |
| `[:* X]`, `[:repeat X]` | `X[]` |
| `[:+ X]`, `[:repeat {:min 1} X]` | `[X, ...X[]]` |
| `[:+ {:min 2} X]`, `[:repeat {:min 2} X]` | `[X, X, ...X[]]` |
| `[:? X]` | `X \| undefined` |
| `[:=> [:cat Args...] Return]`, `[:=> [:catn ...] Return]` | function type |
| `:fn` with `{:typescript "SomeType"}` | `SomeType` |
| unsupported / predicate-only schemas | `unknown`, or branded unknown inside unions |

## Argument context

The generator tracks whether a schema is being emitted for an argument or a return value.

This matters for `:maybe`:

```clojure
[:maybe :string]
```

Return position:

```ts
string | null
```

Argument position:

```ts
string | undefined | null
```

This reflects JavaScript call sites, where optional arguments may be omitted or passed as `undefined`.

## Open maps

Open Malli maps allow additional keys. The generator emits those additional keys as `unknown`, not `any`:

```clojure
[:map [:a :int]]
```

```ts
{
  a: number;
  [key: string]: unknown;
}
```

This preserves assignability for open maps while preventing arbitrary unchecked property access.

Closed maps omit the index signature:

```clojure
[:map {:closed true} [:a :int]]
```

```ts
{
  a: number;
}
```

## `:map-of` key normalization

TypeScript `Record<K, V>` requires `K` to be a property key (`string | number | symbol` or literals). Malli key schemas can be richer than that, so the generator normalizes them:

- `:string`, `:keyword`, `:symbol`, `:uuid`, `:uri`, `:re` → `string`
- `:int`, `:double` → `number`
- enum string/number keys → literal key union
- structural or unknown key schemas → `string`

Examples:

```clojure
[:map-of :keyword :any]
```

```ts
Record<string, unknown>
```

```clojure
[:map-of [:enum :a :b] :int]
```

```ts
Partial<Record<"a" | "b", number>>
```

## TS-aware annotations on `:any`

Some JS-facing functions return native JS arrays or objects (`to-array`, `#js {}`), which are not CLJS persistent collections and should not be validated with `:sequential` or `:map` at runtime.

Use `:any` for runtime validation and attach TypeScript-only schema properties.

### `{:ts/array-of X}`

```clojure
(mu/defn ^:export visible-columns :- [:any {:ts/array-of ::lib.schema.metadata/column}]
  [query stage-number]
  (to-array (lib.core/visible-columns query stage-number)))
```

Generates:

```ts
export function visible_columns(...): Shared.Metabase_Lib_Schema_Metadata_Column[];
```

### `{:ts/object-of X}`

```clojure
(mu/defn ^:export expression-parts :- [:any {:ts/object-of [:map
                                                            [:operator :string]
                                                            [:args [:any {:ts/array-of :any}]]]}]
  [...]
  #js {:operator "="
       :args     #js [...]})
```

Generates an object shape from the supplied map schema.

### `{:typescript "..."}` on `:any`

For exact escape hatches, use:

```clojure
[:any {:typescript "SomeFrontendType"}]
```

This is preferred over `[:fn {:typescript ...} any?]` in JS-facing CLJS files when JVM-side resolution of the predicate would fail.

## JS-facing key transforms

Some JS-facing helpers recursively convert CLJS keys to JavaScript-style keys before returning objects. For example `display-info->js` converts:

- `:display-name` → `displayName`
- `:filter-positions` → `filterPositions`
- `:many-pks?` → `isManyPks`

Use `:ts/key-transform :camelCase` with `:ts/object-of` to reflect that returned JS shape:

```clojure
(mu/defn ^:export displayInfo :- [:any {:ts/object-of ::lib-metric.schema/display-info
                                         :ts/key-transform :camelCase}]
  [...]
  (display-info->js ...))
```

This transform:

- applies recursively to nested map schemas,
- is inherited by nested `:ts/object-of` schemas unless they explicitly set their own transform; use `:ts/key-transform :none` on a nested `:ts/object-of` to reset to default key formatting,
- converts predicate-style keys ending in `?` to `isX`,
- expands registry refs inline under the transform, including explicit `[:ref ...]`, instead of reusing shared kebab-case aliases.

Generated output is concrete camelCase TypeScript:

```ts
export function displayInfo(...): {
  displayName?: string;
  filterPositions?: number[];
  group?: {
    displayName: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};
```

Use this only for functions whose implementation actually performs that key conversion. For opaque CLJS maps, keep the default kebab-case/qualified-key behavior.

## `[:schema ...]` wrappers

Use Malli's `[:schema props child]` wrapper when you need to attach TS-specific metadata to a schema node without changing the runtime shape.

Example:

```clojure
[:schema {:ts/same-as 0} ::lib.schema.metadata/column]
```

The generator reads the wrapper properties, then emits the child schema's TypeScript type. This is different from the `:schema` var metadata attached by `mu/defn`, which is how the generator finds function schemas in the first place.

## Generic return preservation: `:ts/same-as`

Some functions preserve the input type in their return value. Example: applying binning to either a column or a reference should return the same kind of thing the caller passed.

Use `:ts/same-as` on the return schema:

```clojure
(mu/defn ^:export with-binning :- [:schema {:ts/same-as 0}
                                  ::lib.schema.metadata/column]
  [column-or-ref binning-option]
  ...)
```

This emits:

```ts
export function with_binning<T extends Shared.Metabase_Lib_Schema_Metadata_Column>(
  column_or_ref: T,
  binning_option: unknown,
): T;
```

### Explicit generic bounds: `:ts/generic-bound`

If the returned nominal schema is narrower than the actual input domain, provide an explicit generic bound:

```clojure
[:schema {:ts/same-as 0
          :ts/generic-bound [:or ::lib.schema.metadata/column
                              ::lib.schema.ref/ref]}
 ::lib.schema.metadata/column]
```

This emits:

```ts
export function with_binning<
  T extends (Shared.Metabase_Lib_Schema_Metadata_Column | Shared.Metabase_Lib_Schema_Ref_Ref)
>(column_or_ref: T, binning_option: unknown): T;
```

Use this when the output type is directly tied to an input type. Do not add argument schemas solely to avoid `unknown` if the argument does not affect output precision.

This is a pragmatic TypeScript idiom, not a proof that every literal refinement of `T` survives. Only use it when the function preserves the input kind/collection species and key set; avoid it for functions that rebuild a different shape.

## Variadic functions

Variadic CLJS functions are emitted as TypeScript rest arguments.

```clojure
(mu/defn ^:export drill-thru :- ::lib.schema/query
  [query stage-number card-id drill & args]
  ...)
```

Generates:

```ts
export function drill_thru(
  query: unknown,
  stage_number: unknown,
  card_id: unknown,
  drill: unknown,
  ...args: unknown[]
): Shared.Metabase_Lib_Schema_Query;
```

JSDoc `@param` tags also use the canonical rest arg name.

## Unknown branches in unions

When a union contains both known and unknown branches, the generator preserves the known branches and represents the unknown branch with a marker:

```clojure
[:or :string :any]
```

```ts
(string | { readonly __metabaseUnknownSchemaBranch: true })
```

This is intentional. It avoids both of these bad outcomes:

- over-confident narrowing to only the known branch,
- collapsing the entire union to `unknown` and losing useful type information.

For intersection-like schemas (`:and`, `:merge`), unknown branches are dropped when safe because `T & unknown` is equivalent to `T`.

## `:fn` and predicate schemas

Predicate-only schemas often cannot be structurally represented in TypeScript.

Supported/common predicates are mapped directly where possible, e.g.:

- `number?` → `number`
- `int?` → `number`
- `pos-int?`, `nat-int?`, `neg-int?` → `number`
- `boolean?` → `boolean`
- `symbol?`, `uuid?` → `string`

For custom predicates, provide `:typescript` metadata if the accepted shape is known:

```clojure
[:fn {:typescript "bigint"} u.number/bigint?]
```

Without a structural mapping or explicit override, predicate schemas produce `unknown` or a branded unknown branch in unions.

## SCI-unavailable fallback declarations

Some schemas contain `[:fn ...]` validators that require SCI or CLJS-only code unavailable during JVM-side type generation.

Instead of dropping the export, the generator emits a fallback declaration:

- function arguments: `unknown`,
- rest args: `unknown[]`,
- return type: `unknown`,
- constants: `unknown`,
- JSDoc note explaining fallback mode.

This preserves API surface in generated `.d.ts` files.

## Dynamic generation contexts

`schema->ts` is intentionally not globally memoized. Generated output can depend on dynamic generation context, including:

- argument context (`*argument-context*`),
- registry ref collection,
- weak-type diagnostics,
- shared type mode,
- key transforms (`:ts/key-transform`).

Avoid adding global memoization unless it is keyed by all context that can affect output or side effects, and only after measuring build-time need.

## Debugging weak types

Set `MB_DEBUG_CLJS` to log weak generated types during compilation:

```bash
MB_DEBUG_CLJS=1 bun run build:cljs
```

Use verbose mode for per-function detail:

```bash
MB_DEBUG_CLJS=verbose bun run build:cljs
```

The generator records weak types through dynamic tracking while converting schemas.

## Gotchas

### Never change runtime validation shape just to improve TypeScript output

A schema attached to `mu/defn` validates real runtime values in dev/test. Do not add structural constraints only to make generated TypeScript more precise. For example, changing a shape-neutral predicate to `[:and [:sequential :any] [:fn ...]]` makes map values fail validation.

If the runtime contract is shape-neutral but TypeScript needs help, keep validation shape-neutral and add TS metadata such as `:typescript`, `:ts/array-of`, `:ts/object-of`, or a runtime-inert `[:schema props child]` wrapper. After editing shared schemas, run `bun run test-cljs`.

### Plain CLJS return shapes are not necessarily JavaScript property-accessible

Plain Malli `:map` schemas describe CLJS map values, not automatically converted JS objects. The generated structural type is useful for wrapper boundaries and discriminants, but frontend code should not assume direct JS property access unless the CLJS export actually returns a JS object and uses `:ts/object-of`.

Similarly, `:ts/array-of` is for functions that return JS arrays. Plain `[:sequential X]` usually means a CLJS collection.

### No CLJS-only predicates in schemas

The generator runs on the JVM. CLJS-only predicates such as `array?` or `object?` can cause JVM resolution failures. Prefer Malli keyword schemas or `:any` with TS metadata for JS-only values.

### Local schema vars in `.cljs` files can fail JVM resolution

A return schema like this in a `.cljs` namespace can fail during generation:

```clojure
(def ^:private ColumnTypeInfo [:map ...])

(mu/defn ^:export legacy-column->type-info :- ColumnTypeInfo
  ...)
```

The JVM generator may try to require the `.cljs` namespace to resolve the var. Inline the schema or move it to a `.cljc` namespace instead.

### `:number` is not a Malli schema

Use `:int`, `:double`, or a supported predicate such as `number?`. The keyword `:number` is not a registered Malli schema here.

### JS arrays are not CLJS sequences

If a function returns `to-array`, do not use `[:sequential X]` as the runtime schema. Use:

```clojure
[:any {:ts/array-of X}]
```

### JS objects are not CLJS maps

If a function returns `#js {}` or another native JS object, do not use `[:map ...]` as the runtime schema. Use:

```clojure
[:any {:ts/object-of [:map ...]}]
```

### Keyword key formatting depends on runtime conversion

Keyword literal values preserve namespaces, so `[:= :type/Integer]` emits `"type/Integer"`.

Map keys are different: by default, keyword map keys are emitted using `(name k)`, so `:lib/uuid` becomes `uuid`. If runtime output preserves qualified names like `"lib/uuid"`, use explicit string keys in the JS-facing schema:

```clojure
[:map ["lib/uuid" :string]]
```

If runtime output camelCases keys, use `:ts/key-transform :camelCase`.

### Multi-arity `mu/defn`

For multi-arity functions, the return schema appears after the function name. Argument schemas come from each arity’s arglist when present; missing arg schemas become `unknown`.

## Current limitations / precision opportunities

1. **`::lib.schema.ref/ref` is still broad.** It currently expands to a large MBQL clause union because the schema is an `:and` over broad `::mbql-clause/clause` plus a hierarchy predicate. A structural ref union would improve many frontend overloads.

2. **Seqex tuple rest is not precise yet.** Schemas such as `[:cat tag opts [:+ {:min 2} arg]]` currently generate a nested array element, not tuple rest elements. A direct tuple-rest implementation caused frontend overload-resolution fallout, so it needs coordinated work with display-info overloads and discriminants.

3. **Recursive metric math expressions are only partially typed.** JS-facing metric definitions currently type the top-level arithmetic tuple, while nested operands remain broad.

4. **Overload generation is still manual.** APIs such as `display-info` return different shapes by input type. Frontend wrappers still provide overloads manually.

5. **Normalization functions are not inferred.** `:decode/normalize` and `:encode/serialize` can change data shape, but the generator does not inspect arbitrary functions. Use explicit JS-facing schemas or TS metadata when exported runtime shape differs from the raw schema.
