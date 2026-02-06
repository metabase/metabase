# TypeScript Generation from Malli Schemas

Metabase automatically generates TypeScript type declarations (`.d.ts` files) from Malli schemas defined on ClojureScript functions. This bridges the CLJS MLv2 library (`metabase.lib.*`) and the TypeScript frontend, giving the TS codebase accurate types for all exported functions.

## How it works

The generator lives in `src/metabase/util/malli/typescript.clj` and runs as a **shadow-cljs build hook** at the `:flush` stage (after compilation). It:

1. Iterates all CLJS namespaces in the compiler state
2. Finds every `def` that has `:schema` metadata (i.e., defined with `mu/defn`)
3. Converts each Malli schema to a TypeScript type string
4. Writes `.d.ts` files to the shadow-cljs output directory

### Two-pass architecture

**Pass 1 — Collect references:** For each namespace, the generator walks all schemas and records every qualified keyword (registry ref) encountered. It counts how many namespaces reference each schema.

**Pass 2 — Generate files:** Schemas referenced by 2+ namespaces become **shared types**, defined in `metabase.lib.shared.d.ts` and imported via `Shared.TypeName`. Each namespace gets its own `.d.ts` file with:
- An import of `Shared` (if it uses any shared types)
- Type aliases for registry schemas used only by that namespace
- Exported function/constant declarations

The `metabase.lib.js.d.ts` file additionally re-exports all other `metabase.*` modules, so the TS frontend can import everything from a single entry point.

## Schema-to-TypeScript conversion

The core is a multimethod `-schema->ts` that dispatches on `(mc/type schema)`. Some key mappings:

| Malli schema | TypeScript output |
|---|---|
| `:string`, `:keyword`, `:symbol`, `:uuid`, `:re` | `string` |
| `:int`, `:double`, `pos-int?`, `number?` | `number` |
| `:boolean` | `boolean` |
| `:nil` | `null` |
| `:any` | `any` (unless annotated, see below) |
| `[:maybe X]` | `X \| null` (or `X \| undefined \| null` in argument position) |
| `[:sequential X]`, `[:vector X]` | `X[]` |
| `[:set X]` | `Set<X>` |
| `[:map [:key Type] ...]` | `{ key: Type; ... }` |
| `[:map-of K V]` | `Record<K, V>` |
| `[:enum "a" "b"]` | `"a" \| "b"` |
| `[:or A B]` | `A \| B` |
| `[:and A B]` | `A & B` |
| `[:tuple A B]` | `[A, B]` |
| `[:=> [:cat Args...] Return]` | `(arg0: Arg0, ...) => Return` |
| `[:fn {:typescript "SomeType"}]` | `SomeType` (explicit override) |

### Registry refs

Qualified keywords like `::lib.schema/query` are Malli registry references. The generator resolves them via `mr/resolve-schema`, expands them into their full TS type, and emits a `type` alias:

```typescript
export type Metabase_Lib_Schema_Query = { ... };

export function query(databaseId: number, tableId: number): Metabase_Lib_Schema_Query;
```

The naming convention is: namespace segments become `CapitalCase` joined by `_`, entity name becomes `CapitalCase`. Special characters are transliterated (`?` -> `Q`, `!` -> `Bang`, etc.).

### Argument context

`:maybe` schemas produce different output depending on context:
- **Return position:** `T | null`
- **Argument position:** `T | undefined | null`

This is because JS callers typically pass `undefined` (or omit args) rather than `null`. The generator tracks this via the `*argument-context*` dynamic var.

## TS-aware annotations on `:any`

Many `metabase.lib.js` functions return JS arrays (`to-array`) or JS objects (`#js {}`). These fail Malli runtime validation with `:sequential` or `:map` schemas because they're native JS types, not CLJS persistent data structures.

The solution: use `:any` as the base schema (no runtime validation) with metadata properties that the TS generator reads to produce specific types.

### `{:ts/array-of <element-schema>}`

For functions returning JS arrays:

```clojure
(mu/defn ^:export visible-columns :- [:any {:ts/array-of ::lib.schema.metadata/column}]
  [a-query :- ::lib.schema/query
   stage-number :- :int]
  (to-array (lib.core/visible-columns a-query stage-number)))
```

Generates:

```typescript
export function visible_columns(a_query: ..., stage_number: number): Metabase_Lib_Schema_Metadata_Column[];
```

Without the annotation, the return type would be `any`.

### `{:ts/object-of <map-schema>}`

For functions returning JS object literals:

```clojure
(mu/defn ^:export expression-parts :- [:any {:ts/object-of [:map
                                                              [:operator :string]
                                                              [:options :any]
                                                              [:args :any]]}]
  [a-query :- ::lib.schema/query
   stage-number :- :int
   an-expression-clause :- ::lib.schema.expression/expression]
  (let [parts (lib.core/expression-parts a-query stage-number an-expression-clause)]
    #js {:operator (:operator parts)
         :options  (clj->js (:options parts))
         :args     (to-array (:args parts))}))
```

Generates:

```typescript
export function expression_parts(
  a_query: ...,
  stage_number: number,
  an_expression_clause: ...
): {
  operator: string;
  options: any;
  args: any;
};
```

### How it works internally

The `:any` defmethod checks for these properties:

```clojure
(defmethod -schema->ts :any [schema]
  (let [props (mc/properties schema)]
    (cond
      (:ts/array-of props)
      (str (schema->ts (:ts/array-of props)) "[]")

      (:ts/object-of props)
      (schema->ts (:ts/object-of props))

      :else
      (do (record-weak-type! :any)
          "any"))))
```

The `[:any {:ts/array-of X}]` form is valid Malli — `:any` accepts any value at runtime, and the `{:ts/array-of X}` part is schema properties accessible via `mc/properties`. The TS generator reads the properties; Malli runtime validation ignores them.

## The `:fn` escape hatch

For schemas that use `:fn` predicates (which have no structural type info), you can provide an explicit TS type via the `:typescript` property:

```clojure
[:fn {:typescript "Record<string, TemplateTag>"} some-predicate?]
```

Without `:typescript`, `:fn` schemas produce `unknown`.

## Debugging

Set the `MB_DEBUG_CLJS` environment variable to enable weak-type warnings during compilation:

```bash
MB_DEBUG_CLJS=1 yarn shadow-cljs compile app
```

This logs which files/functions produce `any` or `unknown` types. Set `MB_DEBUG_CLJS=verbose` for per-function detail.

The generator tracks weak types via the `*weak-types*` dynamic var. Every time a schema resolves to `any` or `unknown`, it records the namespace and function name.

## Gotchas

**No CLJS-only predicates in schemas.** The TS generator runs on the JVM. Predicates like `array?` or `object?` exist only in CLJS and cause `FileNotFoundException` when the generator tries to resolve them. Use Malli keyword schemas (`:int`, `:string`, `:boolean`) instead.

**`:number` is not a valid Malli schema.** Use `:int` or `:double`. The symbol `number?` works as a predicate schema (dispatches to `'number?` method), but the keyword `:number` does not exist in the Malli registry.

**`to-array` results fail `:sequential` validation.** JS arrays are not CLJS sequences. Use `[:any {:ts/array-of X}]` instead of `[:sequential X]` for functions that call `to-array`.

**`#js {}` results fail `:map` validation.** JS objects are not CLJS maps. Use `[:any {:ts/object-of [:map ...]}]` instead of `[:map ...]` for functions that return JS object literals.

**Memoization and argument context.** The generator memoizes `schema->ts` calls for performance, but bypasses the cache when `*argument-context*` is true (because `:maybe` produces different output). If you see incorrect `undefined` in return types, this is likely a memoization issue.

**Multi-arity `mu/defn`.** For functions with multiple arities, the return schema goes after the function name. Arg schemas go on the longest arity's arglist. The `:function` schema type (wrapping multiple `:=>` children) handles this.
