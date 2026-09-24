# ClojureScript and TypeScript schemas

Read this reference when adding or changing Malli schemas in ClojureScript files, JavaScript export boundaries, or generated TypeScript declarations.

When the work also changes TypeScript wrappers or consumers, read `.claude/skills/typescript-write/SKILL.md` before editing those files.

## Choose the boundary first

| Boundary               | Value the schema sees                                                             | Primary concern                              |
| ---------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| API request            | Parsed and coerced request data                                                   | Accepted wire input                          |
| API response           | Clojure values before JSON serialization                                          | Internal return shape                        |
| `mu/defn` contract     | Arguments and return values at the function call                                  | Runtime correctness                          |
| Exported ClojureScript | The same function values plus the JavaScript representation exposed to TypeScript | Runtime correctness and declaration fidelity |

A schema can participate in more than one boundary. Never make runtime validation less accurate just to produce a more convenient TypeScript declaration.

## Reference files

- `cljs/src/metabase/util/malli/typescript.md` — complete declaration-generation reference
- `src/metabase/pivot/js.cljs` — focused native JavaScript array and object signatures
- `src/metabase/lib/js.cljs` — exported function signatures, including input-preserving returns

## Checklist

For exported ClojureScript:

- [ ] Confirm the value is a `^:export` var in a Shadow entry namespace
- [ ] Schema known arguments and the return value
- [ ] Prefer ordinary Malli when it describes the JavaScript value faithfully
- [ ] Add TypeScript metadata only for a real native-JavaScript or static-type distinction
- [ ] Run clean dev and release builds, strict declaration checks, and runtime export parity checks

Use collection schemas only when they match the runtime value. In particular, don't use a ClojureScript sequence schema to describe a native JavaScript array.

## TypeScript declarations for exported ClojureScript

The existing Shadow `app` dev and release builds generate declarations beside their runtime JavaScript in `target/cljs_dev` and `target/cljs_release`. There is no separate declaration build.

A value declaration is generated only when:

1. The var belongs to a configured Shadow entry namespace.
2. Its analyzer metadata marks it as a JavaScript export, normally with `^:export`.

Start with an ordinary `mu/defn` signature:

```clojure
(mu/defn ^:export normalize-name :- :string
  [name :- :string]
  (str/trim name))
```

This produces a declaration equivalent to:

```typescript
export function normalize_name(name: string): string;
```

Schemas transitively referenced by exported signatures become generated aliases. A public var without export metadata doesn't get a value declaration, and an unrelated registered schema doesn't become a type-only declaration root.

Missing or unrepresentable schemas intentionally become `unknown`. Improve them only when a more precise schema is true at runtime. If a boundary is necessarily unknown, keep the sound fallback and adapt it once in a frontend compatibility wrapper rather than inventing a generated shape.

### Use ordinary Malli first

Ordinary forms generate useful TypeScript directly:

- `[:maybe T]` becomes `T | null`; function arguments also allow `undefined`.
- `[:vector T]` and `[:sequential T]` become `T[]`.
- `[:sequential {:min 1} T]` becomes `[T, ...T[]]`.
- `[:map ...]` becomes an object. Open maps retain an `[key: string]: unknown` index signature; closed maps don't.
- `[:enum :a :b]` becomes `"a" | "b"`.
- `[:or A B]` and `[:and A B]` become unions and intersections.
- Qualified registry keywords become generated aliases when reachable from an export.

Use TypeScript metadata only when ordinary Malli can't express the value that JavaScript callers receive.

### TypeScript metadata reference

Put compiler metadata in the Malli schema's property map. The outer Malli schema still controls runtime validation.

| Metadata                       | Use                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `:typescript "T"`              | Supply an exact TypeScript expression for an otherwise opaque schema                                |
| `:ts/array-of S`               | Describe a native JavaScript array whose elements follow schema `S`                                 |
| `:ts/object-of S`              | Describe a native JavaScript object whose shape follows schema `S`                                  |
| `:ts/ref S`                    | Point to a registered type while keeping runtime validation permissive                              |
| `:ts/promise-of S`             | Describe a JavaScript `Promise` resolving to schema `S`                                             |
| `:ts/key-transform :camelCase` | Render object keys after a real camel-case conversion                                               |
| `:ts/key-transform :none`      | Reset an inherited key transform for a nested object                                                |
| `:ts/instance-of "Array"`      | Internal compatibility for `[:is-a js/Array]` or `js/Object`; prefer precise array/object metadata  |
| `:ts/predicate-of S`           | Declare a type predicate (`x is S`) for a boolean-returning boundary function                       |
| `:ts/dispatch-key :type`       | Name the map key a function-dispatched `:multi` reads, enabling discriminated unions                |
| `:ts/same-as N`                | Tie the return type to zero-based argument `N`                                                      |
| `:ts/generic-bound S`          | Set the accepted generic domain for `:ts/same-as` when it is broader than the nominal return schema |

Don't add new TypeScript-only properties without changing the compiler design and tests.

### Native JavaScript arrays

`to-array` returns a JavaScript array, not a ClojureScript sequential value. Keep the runtime contract permissive and describe the boundary:

```clojure
(mu/defn ^:export columns :- [:any {:ts/array-of ::schema/column}]
  [query :- ::schema/query]
  (to-array (visible-columns query)))
```

Use `[:sequential ...]` only when the function really returns a ClojureScript sequential value.

### Native JavaScript objects and key conversion

`#js {}` isn't a ClojureScript map. Use `:ts/object-of` for its TypeScript shape:

```clojure
(mu/defn ^:export expression-parts
  :- [:any {:ts/object-of
            [:map
             [:operator :string]
             [:args [:any {:ts/array-of :any}]]]
            :ts/key-transform :camelCase}]
  [expression :- ::schema/expression]
  (expression->js expression))
```

Add `:ts/key-transform :camelCase` only when the implementation converts keys. It applies recursively; a nested `:ts/object-of` can reset it with `:ts/key-transform :none`.

The resolver automatically translates `[:is-a js/Array]` and `[:is-a js/Object]` through the internal `:ts/instance-of` compatibility property. These render as `unknown[]` and `Record<string, unknown>` respectively; other class names remain `unknown`. Prefer `:ts/array-of` or `:ts/object-of` whenever the boundary has a precise shape, and don't author `:ts/instance-of` directly without a compiler-specific reason.

### Input-preserving return types

Use `:ts/same-as` when the implementation preserves the kind of one argument:

```clojure
(mu/defn ^:export with-bucket
  :- [:schema {:ts/same-as 0}
      ::schema/column]
  [column :- ::schema/column
   bucket :- :keyword]
  (assoc column :temporal-unit bucket))
```

If the function accepts a broader domain than the nominal return schema, describe that domain explicitly:

```clojure
[:schema {:ts/same-as 0
          :ts/generic-bound
          [:or ::schema/column ::schema/ref]}
 ::schema/column]
```

Use this only when the implementation truly preserves the input kind. It isn't a substitute for the schema of a transformation.

### Promises, explicit references, and opaque predicates

Describe a JavaScript promise result with:

```clojure
[:any {:ts/promise-of :string}]
```

A boolean-returning function that narrows its argument declares what `true` guarantees with `:ts/predicate-of`:

```clojure
(mu/defn ^:export is-date? :- [:boolean {:ts/predicate-of ::schema/type-info}]
  [column]
  ...)
```

The declaration renders as `(column: unknown) => column is Shared.TypeInfo`, so JavaScript branches narrow for free. `{:param 1, :schema S}` narrows a later argument. Keep the target a sound over-approximation, and never annotate a function that returns `true` unconditionally.

When a `:multi` dispatches via a function that reads one map key, name it with `:ts/dispatch-key`:

```clojure
[:multi {:dispatch #(keyword (:type %))
         :ts/dispatch-key :type}
 ...]
```

The compiler then synthesizes literal discriminants into branches and emits per-branch `Extract<>` aliases. Keyword `:dispatch` values are detected automatically; leave computed dispatches unannotated.

Use `:ts/ref` when runtime validation must stay permissive but the declaration has a registered type:

```clojure
[:any {:ts/ref ::schema/column}]
```

Give an opaque predicate an exact static type with `:typescript`:

```clojure
[:fn {:typescript "bigint"} u.number/bigint?]
```

The `:typescript` value must be a valid TypeScript type expression. The compiler doesn't evaluate the predicate merely to render that explicit type.

### Preserve runtime validation

Schemas on `mu/defn` validate real values in development and tests. Don't replace a shape-neutral runtime contract with a structural schema solely for nicer declarations:

- A JavaScript array isn't a ClojureScript sequence.
- A JavaScript object isn't a ClojureScript map.
- A ClojureScript map isn't automatically property-accessible from JavaScript.
- A normalization or serialization function can change the exposed shape.

The generator runs on the JVM. Avoid CLJS-only predicates in schemas used for generation. A schema stored only in a `.cljs` var can also be unavailable to JVM-side registry resolution; inline it or move it to `.cljc` when appropriate. Reader-conditional JVM and CLJS schemas can differ, so don't infer a JavaScript representation from JVM-only predicates such as `bytes?` or `uri?`; keep it `unknown` unless the exported boundary performs a documented conversion.

### Verify generated declarations

Run clean builds and validate both output modes:

```bash
bun run build-pure:cljs
bun run type-check-generated-cljs
bun run check-generated-cljs-exports
bun run build-release:cljs
bun run type-check-generated-cljs:release
bun run check-generated-cljs-exports:release
```

The build commands clean their respective output directories. The type checks use strict TypeScript with `skipLibCheck: false`. The export checks compare generated value declarations with runtime export keys for every configured module.

When boundary schemas or frontend consumers change, also run:

```bash
bun run type-check-pure
```

For declaration compiler changes, run the focused generator suite:

```bash
./bin/test-agent --cljs \
  :only '[metabase.util.malli.typescript-test metabase.util.malli.typescript.declaration-test metabase.util.malli.typescript.type-test metabase.util.malli.typescript.schema-test metabase.util.malli.typescript.refs-test metabase.util.malli.typescript.build-test]'
```
