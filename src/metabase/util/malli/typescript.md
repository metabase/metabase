# Generate TypeScript declarations from Malli schemas

Metabase generates TypeScript declaration files for ClojureScript modules that form a JavaScript runtime boundary. The generator uses ordinary Malli schemas as its primary input and writes `.d.ts` files under `target/cljs_dev` during the Shadow CLJS `:flush` stage.

The declarations describe the runtime modules that TypeScript can actually import. They are not a catalog of every schema or public var in the ClojureScript analyzer.

## Export runtime values before generating declarations

A value gets a declaration when both of these conditions are true:

1. Its namespace is a Shadow CLJS entry namespace.
2. Its analyzer metadata marks it as a JavaScript export, usually through `^:export`.

For example:

```clojure
(mu/defn ^:export normalize-name :- :string
  [name :- :string]
  (str/trim name))
```

The generated entry module includes:

```ts
export function normalize_name(name: string): string;
```

A public ClojureScript var without export metadata doesn't get a value declaration. A schema in a dependency namespace doesn't create a declaration module by itself.

If an exported value has no usable schema, the generator still declares the runtime export with a sound fallback:

- arguments and return values use `unknown`;
- rest arguments use `unknown[]`;
- constants use `unknown`.

This keeps runtime and declaration exports in sync without claiming more than the schema can prove.

## Keep type-only frontend concepts handwritten

Generated shared aliases come only from schemas that are transitively reachable from real exported signatures. There is no configured list of type-only roots.

Frontend code must not import generated modules for internal namespaces such as an aggregation, filter, or column-group implementation that has no matching JavaScript entry module. Keep a handwritten opaque or structural frontend type instead. If a real exported signature is necessarily `unknown`, cast it once in the frontend compatibility wrapper rather than weakening the generated declaration.

This rule keeps generated files honest: every generated value module corresponds to a module that exists at runtime.

## Follow the compiler pipeline

The implementation is split by responsibility:

| Namespace                                    | Responsibility                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `metabase.util.malli.typescript.type`        | TypeScript expression IR and precedence-aware rendering                |
| `metabase.util.malli.typescript.schema`      | Malli-to-TypeScript compilation                                        |
| `metabase.util.malli.typescript.refs`        | Transitive registry closure, recursion handling, and alias emission    |
| `metabase.util.malli.typescript.declaration` | Function and constant declarations                                     |
| `metabase.util.malli.typescript.build`       | Shadow entry selection, shared placement, diagnostics, and file output |
| `metabase.util.malli.typescript`             | Stable public facade and Shadow build hook                             |

Schema compilation returns structured data rather than a partially assembled string:

```clojure
{:type              type-expression
 :registry-refs     #{...}
 :local-definitions {...}
 :diagnostics       [...]}
```

Declaration compilation adds declaration text and weak-type information. Build orchestration consumes those result maps without reaching into declaration internals.

At build time, the generator:

1. Loads analyzer namespaces so Malli registries in dependencies are available.
2. Selects explicit runtime exports from configured Shadow entries.
3. Compiles exported signatures and computes their transitive registry closure.
4. Keeps inline `:schema` registry aliases local to their entry module.
5. Writes reachable global aliases to `metabase.lib.shared.d.ts`.
6. Writes one declaration file per runtime entry module.

Entry files use explicit value declarations. They don't wildcard-re-export dependency namespaces.

## Use ordinary Malli for normal shapes

Common Malli forms map directly to TypeScript:

| Malli                                                    | TypeScript                                      |
| -------------------------------------------------------- | ----------------------------------------------- |
| `:string`, `:keyword`, `:symbol`, `:uuid`, `:uri`, `:re` | `string`                                        |
| time schemas such as `:time/local-date`                  | `string`                                        |
| `:int`, `:double`, numeric predicates                    | `number`                                        |
| `:boolean`, `boolean?`                                   | `boolean`                                       |
| `:nil`                                                   | `null`                                          |
| `:any` or an unsupported predicate                       | `unknown`                                       |
| `[:maybe T]`                                             | `T \| null`; arguments also include `undefined` |
| `[:vector T]`, `[:sequential T]`                         | `T[]`                                           |
| `[:sequential {:min 1} T]`                               | `[T, ...T[]]`                                   |
| `[:set T]`                                               | `Set<T>`                                        |
| `[:tuple A B]`                                           | `[A, B]`                                        |
| `[:enum :a :b]`                                          | `"a" \| "b"`                                    |
| `[:or A B]`                                              | `A \| B`                                        |
| `[:and A B]`, `[:merge A B]`                             | `A & B`                                         |
| `[:map [:key T]]`                                        | `{ key: T; ... }`                               |
| `[:map-of K V]`                                          | `Record<K, V>` with safe key normalization      |
| `[:map-of [:enum ...] V]`                                | `Partial<Record<literal union, V>>`             |
| `[:=> args result]`                                      | a function type                                 |

The renderer tracks precedence. An array of a union renders as `(A | B)[]`, not `A | B[]`.

### Open maps keep unknown additional values

An open Malli map accepts extra keys, so its TypeScript object includes an `unknown` index signature:

```clojure
[:map [:name :string]]
```

```ts
{
  name: string;
  [key: string]: unknown;
}
```

A closed map omits the index signature.

If multiple Malli keys render to the same TypeScript property, the compiler emits one property whose type is the union of all contributors. Collisions can come from a key transform or from the default removal of keyword namespaces, such as `:source` and `:lib/source`. The property is optional only when every contributor is optional. The compiler also records a `:map-key-collision` diagnostic.

### Unknown stays sound

`unknown` absorbs a union:

```clojure
[:or :string :any]
```

```ts
type Value = unknown;
```

The generator doesn't invent a marker object for an unrepresentable runtime value. For intersections, `T & unknown` safely simplifies to `T`.

### Sequence expressions become flat tuples

The generator supports Malli sequence expressions without nesting their positional elements:

- `:cat` and `:catn` concatenate tuple positions;
- `:alt` and `:altn` produce tuple alternatives;
- `:?` produces an optional tuple position when possible;
- `:*` produces a rest position;
- `:+` and `:repeat` preserve required leading elements before a rest position.

For exported functions, optional positions become optional parameters and repeated trailing positions become TypeScript rest parameters.

## Let registry references drive aliases

A qualified registry key such as:

```clojure
:metabase.lib.schema.metadata/column
```

becomes:

```ts
Metabase_Lib_Schema_Metadata_Column;
```

Global registry aliases reachable from exported signatures live in `metabase.lib.shared.d.ts`. Entry modules import them with:

```ts
import type * as Shared from "./metabase.lib.shared";
```

Inline registries remain in the entry declaration that owns them. Their global transitive dependencies still use `Shared.*` aliases.

The reference compiler handles recursive aliases structurally. Recursion through an object, array, tuple, or function guard remains recursive. An unsafe direct alias cycle degrades only the unsafe edge to `unknown` and records a diagnostic.

## Add TypeScript metadata only at a real JS boundary

Ordinary Malli should describe ordinary values. Use the existing TypeScript-specific properties only when Malli can't express the JavaScript representation.

The supported properties are:

- `:typescript`
- `:ts/array-of`
- `:ts/object-of`
- `:ts/ref`
- `:ts/promise-of`
- `:ts/key-transform`
- `:ts/same-as`
- `:ts/generic-bound`

Don't add new TypeScript-only schema notation without changing the compiler design and tests.

### Describe native JavaScript arrays

A function returning `to-array` returns a JavaScript array, not a ClojureScript sequential value. Keep runtime validation permissive and describe the boundary:

```clojure
[:any {:ts/array-of ::lib.schema.metadata/column}]
```

This renders as an array of the referenced column type.

### Describe native JavaScript objects

A function returning `#js {}` isn't returning a ClojureScript map. Use `:ts/object-of`:

```clojure
[:any {:ts/object-of
       [:map
        [:operator :string]
        [:args [:any {:ts/array-of :any}]]]}]
```

Use `:ts/key-transform :camelCase` only when the implementation really converts keys to JavaScript-style names. The transform applies recursively. A nested `:ts/object-of` can reset it with `:ts/key-transform :none`.

### Name an otherwise opaque type

Use `:typescript` when the boundary has an exact TypeScript type that Malli can't derive:

```clojure
[:fn {:typescript "bigint"} bigint?]
```

The compiler doesn't evaluate that predicate just to render the explicit type.

### Point to a registry type explicitly

Use `:ts/ref` when the runtime schema must stay permissive but the TypeScript boundary has a registry type:

```clojure
[:any {:ts/ref ::lib.schema.metadata/column}]
```

Use `:ts/promise-of` for a JavaScript promise result:

```clojure
[:any {:ts/promise-of :string}]
```

### Preserve an input type in the return value

Use `:ts/same-as` on a return schema when a function preserves the kind of one argument:

```clojure
[:schema {:ts/same-as 0}
 ::lib.schema.metadata/column]
```

This produces a generic return tied to argument index `0`. If the nominal return schema is narrower than the accepted input domain, provide `:ts/generic-bound`:

```clojure
[:schema {:ts/same-as 0
          :ts/generic-bound
          [:or ::lib.schema.metadata/column
               ::lib.schema.ref/ref]}
 ::lib.schema.metadata/column]
```

Use this only when the implementation preserves the input kind. It isn't a substitute for a real transformation schema.

## Don't change runtime validation for prettier TypeScript

Schemas attached to `mu/defn` validate real values in development and tests. Don't replace a shape-neutral runtime contract with a structural schema solely to improve generated TypeScript.

In particular:

- a JavaScript array isn't a ClojureScript sequence;
- a JavaScript object isn't a ClojureScript map;
- a ClojureScript map isn't automatically property-accessible from JavaScript;
- a normalization or serialization function may change a value in ways the raw Malli schema doesn't reveal.

Use the boundary annotations above only when the implementation performs the matching JavaScript conversion.

The generator runs on the JVM. Avoid CLJS-only predicates in schemas used for generation. A schema stored only in a `.cljs` var may also be unavailable to JVM-side resolution; inline it or move the schema to `.cljc` when appropriate.

## Run strict declaration checks after a clean build

Run:

For compiler-only changes, run:

```bash
bun run build-pure:cljs
bun run type-check-generated-cljs
bun run check-generated-cljs-exports
```

`type-check-generated-cljs` compiles generated declarations with strict TypeScript and `skipLibCheck: false`.

`check-generated-cljs-exports` verifies that every module listed by the build hook has a declaration file, then compares its value declarations with its runtime export keys. A declaration that exists only as a type doesn't count as a runtime value.

When a branch also updates the Malli boundary schemas or frontend consumers, run the full frontend check after the three compiler checks:

```bash
bun run type-check-pure
```

A compiler-only review branch can expose expected `unknown` incompatibilities in existing frontend wrappers until its companion schema and frontend changes are applied.

Run the generator tests with the `:cljs` alias:

```bash
HAWK_MODE=cli/ci clojure -X:dev:ee:ee-dev:test:cljs \
  :only '[metabase.util.malli.typescript-test metabase.util.malli.typescript.declaration-test metabase.util.malli.typescript.type-test metabase.util.malli.typescript.schema-test metabase.util.malli.typescript.refs-test metabase.util.malli.typescript.build-test]'
```

Run cljfmt after editing Clojure files.

## Inspect weak fallback types

Set `MB_DEBUG_CLJS` to report generated `any` and `unknown` fallback types:

```bash
MB_DEBUG_CLJS=1 bun run build-pure:cljs
```

Use `MB_DEBUG_CLJS=verbose` to list the affected exports.

## Know the remaining precision limits

Argument schema coverage is incomplete. Missing argument schemas intentionally remain `unknown`; adding argument annotations across the API is separate work.

Custom predicates without a structural mapping or explicit `:typescript` value remain `unknown`. The compiler also doesn't infer arbitrary normalization functions, serializers, or JavaScript interop behavior.

Those limits should produce conservative declarations, not missing runtime exports or invented shapes.
