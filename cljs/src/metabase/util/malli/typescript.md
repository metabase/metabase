# Generate TypeScript declarations from Malli schemas

The compiler reads Malli schemas for JavaScript exports and writes `.d.ts` files beside the compiled ClojureScript. It only processes namespaces listed in the Shadow `app` build's `:entries` in `shadow-cljs.edn`.

Malli provides schema validation, transformation, generation, and translation. This compiler adds Shadow entry and export discovery, declaration output, and TypeScript relationships such as type predicates and correlated generics. Malli remains the source schema.

## TypeScript metadata

Properties such as `:typescript` and `:ts/array-of` are extensions for this compiler, not standard Malli or TypeScript syntax. They live in the Malli schema's property map and describe information needed for the declaration.

For example:

```clojure
[:and
 [:fn array?]
 [:any {:ts/array-of :string}]]
```

The predicate describes a native JavaScript array, not a ClojureScript sequence. The metadata adds the element type to the declaration:

```ts
string[]
```

Use metadata when:

- the Malli schema is intentionally permissive at runtime;
- ClojureScript converts a value before returning it to JavaScript; or
- TypeScript needs a relationship, such as argument narrowing or preserving an input subtype, that Malli does not express.

Metadata keeps the runtime schema and declaration together. Don't change runtime validation just to get a more convenient TypeScript type, or maintain a separate declaration that can drift from the schema. Use ordinary Malli where it fits. Add metadata for the conversion or type relationship Malli can't describe.

For native containers, keep a real predicate alongside the metadata. The `:any` node carries the annotation; it isn't a validator for the container's contents. Reuse the producer's canonical element and property schemas.

## Which exports get declarations

A value gets a declaration when both conditions are true:

1. Its namespace is a Shadow ClojureScript entry namespace.
2. Its analyzer metadata marks it as a JavaScript export, usually with `^:export`.

For example:

```clojure
(mu/defn ^:export normalize-name :- :string
  [name :- :string]
  (str/trim name))
```

The compiler generates:

```ts
export function normalize_name(name: string): string;
```

The examples omit generated JSDoc comments to focus on the declarations.

The Shadow `app` build hook writes declarations beside the compiled JavaScript during the `:flush` stage:

- development: `target/cljs_dev`
- release: `target/cljs_release`

Declaration modules correspond to importable JavaScript modules. A public ClojureScript var without export metadata doesn't get a value declaration. A schema in an internal dependency namespace doesn't create a declaration module.

An exported value without a usable schema still gets a declaration, with `unknown` types:

```clojure
(defn ^:export transform [value]
  ...)
```

```ts
export function transform(value: unknown): unknown;
```

Rest arguments fall back to `unknown[]`, and constants fall back to `unknown`. The compiler doesn't invent types it can't prove.

## Start with ordinary Malli

Start with the Malli schema that validates the actual value. Common schemas compile directly:

| Malli input                                      | TypeScript output                     |
| ------------------------------------------------ | ------------------------------------- |
| `:string`, `:keyword`, `:symbol`, `:uuid`, `:re` | `string`                              |
| time schemas such as `:time/local-date`          | `string`                              |
| `:int`, `:double`, numeric predicates            | `number`                              |
| `:boolean`, `boolean?`                           | `boolean`                             |
| `:nil`                                           | `null`                                |
| `:any` or an unsupported predicate               | `unknown`                             |
| `[:maybe :string]`                               | `string \| null`                      |
| `[:vector [:or :string :int]]`                   | `(string \| number)[]`                |
| `[:sequential {:min 1} :string]`                 | `[string, ...string[]]`               |
| `[:set :string]`                                 | `Set<string>`                         |
| `[:tuple :string :int]`                          | `[string, number]`                    |
| `[:enum :asc :desc]`                             | `"asc" \| "desc"`                     |
| `[:map-of :string :int]`                         | `Record<string, number>`              |
| `[:map-of [:enum :a :b] :int]`                   | `Partial<Record<"a" \| "b", number>>` |
| `'ifn?` or `'fn?`                                | `(...args: unknown[]) => unknown`     |

These forms need no TypeScript metadata.

### Open and closed maps

An open Malli map accepts additional keys:

```clojure
[:map
 [:name :string]
 [:count {:optional true} :int]]
```

```ts
{
  name: string;
  count?: number;
  [key: string]: unknown;
}
```

A closed map removes the index signature:

```clojure
[:map {:closed true}
 [:name :string]
 [:count {:optional true} :int]]
```

```ts
{
  name: string;
  count?: number;
}
```

When several Malli keys render as the same TypeScript property, the compiler unions their types in one field and records a `:map-key-collision` diagnostic.

For example:

```clojure
[:map
 [:source :string]
 [:lib/source {:optional true} :int]
 [:other/source :boolean]]
```

```ts
{
  source: string | number | boolean;
  [key: string]: unknown;
}
```

### Sequence expressions become flat tuples

Malli sequence expressions preserve order, optional positions, alternatives, and repetition:

```clojure
[:=>
 [:cat :string [:? :int] [:* :boolean]]
 :string]
```

```ts
(arg0: string, arg1?: number, ...arg2: boolean[]) => string;
```

Named sequence entries become labeled tuple elements or parameter names:

```clojure
[:catn
 [:op :keyword]
 [:value :int]]
```

```ts
[op: string, value: number]
```

The compiler preserves this order and emits flat tuples with valid rest elements. In Malli, a bare registry keyword inside a sequence expression (such as `[:cat [:= :clause] ::options ::repeated-args]`) splices when its registered schema is itself a sequence expression (`:cat`, `:catn`, `:alt`, `:altn`, `:?`, `:*`, `:+`, or `:repeat`), whereas `[:schema [:ref ::clause]]` (or `[:ref ::clause]`) validates a single element at that position and stays a scalar tuple item.

### Multi-arity functions become overload intersections

A Malli `:function` schema means one function supports all listed signatures:

```clojure
[:function
 [:=> [:cat :string] :int]
 [:=> [:cat :string :int] :int]]
```

```ts
((arg0: string) => number) & ((arg0: string, arg1: number) => number);
```

The intersection describes a function with both signatures. A union would describe one function or the other and prevent many valid calls.

### Registry schemas become named aliases

A qualified registry key becomes a TypeScript alias:

```clojure
:metabase.lib.schema.metadata/column
```

```ts
Metabase_Lib_Schema_Metadata_Column;
```

The compiler writes global aliases reachable from exported signatures to `metabase.lib.shared.d.ts`. Entry modules use a type-only import:

```ts
import type * as Shared from "./metabase.lib.shared";

export function display_info(
  column: Shared.Metabase_Lib_Schema_Metadata_Column,
): unknown;
```

Inline `:schema` registries remain in the entry declaration that owns them. Recursive references through an object, array, tuple, or function remain recursive. An unsafe direct alias cycle widens only the unsafe edge to `unknown` and records a diagnostic.

### Nullable function inputs also accept `undefined`

A `[:maybe T]` value alias is `T | null`. As a function argument, it also accepts `undefined`.

When a named alias contains nested `:maybe` schemas, the compiler emits a contextual `Input_...` alias for the argument and its referenced schemas. The input alias adds `undefined` at nullable positions; the value alias stays unchanged. The compiler emits each input alias once and keeps recursive references, rather than inlining a shared schema repeatedly.

## JavaScript conversions

Ordinary Malli describes Clojure values. Use TypeScript metadata when the exported function returns a different JavaScript representation.

The supported properties are:

- `:typescript`
- `:ts/array-of`
- `:ts/object-of`
- `:ts/ref`
- `:ts/promise-of`
- `:ts/key-transform`
- `:ts/instance-of` (compiler compatibility property)
- `:ts/predicate-of`
- `:ts/dispatch-key`
- `:ts/same-as`
- `:ts/generic-bound`

Metadata must match the value the function exposes to JavaScript.

### Native JavaScript arrays

`to-array` returns a JavaScript array, not a ClojureScript sequence:

```clojure
[:and
 [:fn array?]
 [:any {:ts/array-of [:maybe :string]}]]
```

```ts
(string | null)[]
```

`array?` checks the native container. `[:sequential T]` validates a Clojure sequence, not a JavaScript array. The `:ts/array-of` metadata describes the elements but doesn't validate them. Use the producer's canonical schema for their runtime contract.

### Native JavaScript objects

`#js {}` creates a native JavaScript object, not a ClojureScript map:

```clojure
[:and
 [:fn #(= (type %) js/Object)]
 [:any {:ts/object-of
        [:map {:closed true}
         [:operator [:= "="]]
         [:values [:and [:fn array?]
                   [:any {:ts/array-of :string}]]]]}]]
```

```ts
{
  operator: "=";
  values: string[];
}
```

This string-equality filter has a native `values` array. The predicate checks for a plain JavaScript object. The map inside `:ts/object-of` describes the properties for TypeScript; a `:map` validator on the outer value would reject the native object.

### Camel-case keys

Use `:ts/key-transform :camelCase` only when the implementation converts keys to camel case:

```clojure
[:and
 [:fn #(= (type %) js/Object)]
 [:any {:ts/object-of
        [:map {:closed true}
         [:display-name :string]
         [:filter-positions {:optional true}
          [:and [:fn array?] [:any {:ts/array-of :int}]]]
         [:many-pks? {:optional true} :boolean]]
        :ts/key-transform :camelCase}]]
```

```ts
{
  displayName: string;
  filterPositions?: number[];
  isManyPks?: boolean;
}
```

Malli validates the original keys. The compiler applies the key transform recursively to describe the serializer's output. A nested schema node can reset the transform with `:ts/key-transform :none` or override it with `:camelCase`. Maps, refs, sequence expressions, and function argument sequences all follow this rule.

For example, retain the original keys of a nested persistent value while converting its enclosing object:

```clojure
[:and
 [:fn #(= (type %) js/Object)]
 [:any {:ts/object-of
        [:map {:closed true}
         [:nested-value [:map {:closed true :ts/key-transform :none}
                         [:display-name :string]]]]
        :ts/key-transform :camelCase}]]
```

```ts
{
  nestedValue: {
    "display-name": string;
  };
}
```

For simple string keys, the compiler can use its generated `Camel<...>` mapped type instead of expanding every transformed key:

```clojure
[:and
 [:fn #(= (type %) js/Object)]
 [:any {:ts/object-of
        [:map {:closed true}
         ["display-name" :string]
         ["enabled?" {:optional true} :boolean]]
        :ts/key-transform :camelCase}]]
```

```ts
Camel<{
  "display-name": string;
  "enabled?"?: boolean;
}>;
```

When an entry module imports shared aliases, the same expression appears as `Shared.Camel<...>`.

### Explicit types with `:typescript`

Use `:typescript` when Malli can't derive the JavaScript value's exact type:

```clojure
(def ^:export ^{:schema [:fn {:typescript "RegExp"}
                         #(instance? js/RegExp %)]}
  data-image-uri-pattern
  #"^data:image/")
```

```ts
export const data_image_uri_pattern: RegExp;
```

The predicate describes the actual ClojureScript regular-expression instance. The JVM generator can't infer its JavaScript class from the predicate body, so `:typescript` supplies that static type.

The same property can annotate a predicate schema:

```clojure
[:fn {:typescript "bigint"} u.number/bigint?]
```

```ts
bigint;
```

The compiler renders the explicit type without evaluating the predicate.

Inline export metadata can compute the TypeScript string with a Clojure expression:

```clojure
(ns example.birds
  (:require [metabase.util.number :as u.number]))

(def ^{:export true
       :schema [:fn {:typescript (str "big" "int")} u.number/bigint?]}
  bird-count (u.number/bigint 42))
```

```ts
export const bird_count: bigint;
```

The expression runs on the JVM during declaration generation, including for `.cljs` exports and `mu/defn` schemas. Namespace aliases must resolve to JVM-loadable helpers. For a helper defined only in ClojureScript, move it to `.cljc` or use a string instead.

Registered `.clj`/`.cljc` schemas evaluate their expressions when the namespace loads. The generator leaves those resulting strings unchanged.

The generator evaluates only `:typescript` property values, not predicate bodies or arbitrary schema forms. Each result must be a string. For evaluation failures or non-string results, the error reports the owning namespace, definition, and source location when available. These expressions run as trusted project code, without a sandbox.

### Permissive references with `:ts/ref`

When the runtime value satisfies the registry schema, reference it directly:

```clojure
::lib.schema.metadata/column
```

Reserve `:ts/ref` for an existing permissive runtime contract whose JavaScript type is established separately:

```clojure
[:any {:ts/ref ::lib.schema.metadata/column}]
```

In an entry declaration, the compiler emits:

```ts
Shared.Metabase_Lib_Schema_Metadata_Column;
```

`:any` accepts any runtime value and compiles to `unknown`. `:ts/ref` supplies the known TypeScript type without replacing the runtime schema. Direct `schema->ts` calls return the unqualified alias because they have no entry-module import context.

### JavaScript promises

```clojure
[:and
 [:fn #(instance? js/Promise %)]
 [:any {:ts/promise-of :string}]]
```

```ts
Promise<string>;
```

The predicate checks the promise instance. It doesn't wait for or validate the resolved value. `:ts/promise-of` describes the known result schema.

### JavaScript instance checks

The declaration resolver converts JavaScript class checks into the internal `:ts/instance-of` compatibility property:

```clojure
[:is-a js/Array]
```

```ts
unknown[]
```

```clojure
[:is-a js/Object]
```

```ts
Record<string, unknown>;
```

The JVM generator can't resolve `js/Array` or `js/Object` as JVM classes. Use `:ts/array-of` or `:ts/object-of` when you know the element or property schema. Leave `:ts/instance-of` to the resolver.

## TypeScript relationships

Some TypeScript types relate arguments and return values. The compiler needs metadata or inference to describe those relationships.

### Type predicates

A predicate can declare both what a `true` result guarantees and what a `false` result excludes:

```clojure
(mu/defn ^:export is-date? :- [:boolean {:ts/predicate-of :string}]
  [value :- :any]
  (string? value))
```

```ts
export function is_date_QMARK_(value: unknown): value is string;
```

Malli knows the function returns a boolean. A TypeScript type predicate also tells the caller how to narrow the argument:

```ts
if (is_date_QMARK_(value)) {
  value.toUpperCase(); // value is string here
} else {
  // value is excluded from string only when the predicate's false result
  // really proves that exclusion.
}
```

Use `:ts/predicate-of` only when both branches are sound. A `true` result must mean the value matches the target; a `false` result must exclude it. If a category check can return `false` for a valid type-info object, declare its return as `boolean`, not a TypeScript guard.

To narrow a later argument, use a map:

```clojure
[:boolean {:ts/predicate-of {:param 1, :schema :string}}]
```

For a function with arguments `category` and `column`, the compiler emits:

```ts
export function field_type(
  category: unknown,
  column: unknown,
): column is string;
```

### Discriminated unions

The compiler detects keyword dispatch in a Malli `:multi`:

```clojure
[:multi {:dispatch :type}
 [:field
  [:map {:closed true}
   [:name :string]]]
 [:expression
  [:map {:closed true}
   [:operator :string]]]]
```

```ts
{
  type: "field";
  name: string;
} | {
  type: "expression";
  operator: string;
}
```

Malli can execute a function-valued `:dispatch`, but the compiler can't determine which property it reads. If the function reads one key, name it with `:ts/dispatch-key`:

```clojure
[:multi {:dispatch #(keyword (:type %))
         :ts/dispatch-key :type}
 [:field
  [:map {:closed true}
   [:name :string]]]
 [:expression
  [:map {:closed true}
   [:operator :string]]]]
```

The TypeScript union is the same:

```ts
{
  type: "field";
  name: string;
} | {
  type: "expression";
  operator: string;
}
```

For a named registry schema such as `Example`, the compiler also emits branch aliases:

```ts
export type Example_Field = Extract<Example, { type: "field" }>;
export type Example_Expression = Extract<Example, { type: "expression" }>;
```

Leave computed dispatches, presence checks, and derived tags unannotated. A declared dispatch key must correspond to the actual runtime dispatch.

### Unchanged inputs with `:ts/same-as`

An argument and return value can satisfy the same schema without preserving the argument's subtype. The compiler doesn't infer that relationship. Declare it only when the function returns the input unchanged:

```clojure
(ns metabase.example
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli :as mu]))

(mr/def ::value :string)

(mu/defn ^:export identity
  :- [:schema {:ts/same-as 0} ::value]
  [value :- ::value]
  value)
```

```ts
export function identity<T extends Shared.Metabase_Example_Value>(value: T): T;
```

`:ts/same-as 0` ties the return to argument index `0`, including its literal type and extra properties. Preserving only the input's broad runtime kind isn't enough.

### Kind-preserving transformations

For a transformation that preserves a finite set of kinds, use declaration overloads instead. In this example, the second argument accepts a nullable string:

```clojure
[:schema
 {:ts/overloads
  [[:=> [:cat ::metadata-column [:maybe :string]] ::metadata-column]
   [:=> [:cat ::reference [:maybe :string]] ::reference]
   [:=> [:cat [:or ::metadata-column ::reference] [:maybe :string]]
    [:or ::metadata-column ::reference]]]}
 [:or ::metadata-column ::reference]]
```

Each input kind has a corresponding output kind. The overloads don't promise to preserve arbitrary subtypes or extra properties.

Keep the runtime schema as an input/output union. Put `:ts/overloads` on its return `:schema`, with an ordinary `:=>` signature for each supported kind and a union-input fallback. The compiler emits TypeScript overloads without changing Malli validation. Every listed input kind must have the listed output kind. If it doesn't, use the union result instead.

## Compiler options

### Readonly containers

Set `MB_CLJS_TS_READONLY=1` to emit readonly types for containers in value positions:

```clojure
[:vector :string]
```

Default output:

```ts
string[]
```

Readonly output:

```ts
readonly string[]
```

Other readonly forms include:

```ts
Readonly<{ name: string }>;
Readonly<Record<string, number>>;
ReadonlySet<string>;
```

Inline container types in function parameters stay mutable, so this option doesn't narrow those inputs. Parameters that use registry aliases can still refer to readonly types.

Malli validates collection contents, not TypeScript mutation rules. Readonly output is opt-in because callers must copy a readonly value before mutating it.

### Find fallback types

Set `MB_DEBUG_CLJS` to report generated `any` and `unknown` fallback types:

```bash
MB_DEBUG_CLJS=1 bun run build-pure:cljs
```

Use verbose mode to list the affected exports:

```bash
MB_DEBUG_CLJS=verbose bun run build-pure:cljs
```

## Call the compiler directly

`metabase.util.malli.typescript` is the stable Clojure facade:

| Function                        | Purpose                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `schema->ts`                    | Compile one Malli schema to a TypeScript type expression     |
| `generate-typescript-interface` | Wrap a compiled object schema in an exported interface       |
| `generate-typescript-type`      | Wrap a compiled schema in an exported type alias             |
| `fn->ts`                        | Compile exported function analyzer metadata                  |
| `const->ts`                     | Compile exported constant analyzer metadata                  |
| `def->ts`                       | Dispatch function and constant metadata, including fallbacks |
| `produce-dts`                   | Shadow build hook that writes declaration files              |

For example:

```clojure
(ts/schema->ts [:vector [:or :string :int]])
```

```ts
(string | number)[]
```

Use the facade in tests and debugging tools. Normal builds call `produce-dts` through `shadow-cljs.edn`.

## Build and verify declarations

For compiler changes, validate development and release output:

```bash
bun run build-pure:cljs
bun run type-check-generated-cljs
bun run check-generated-cljs-exports
bun run build-release:cljs
bun run type-check-generated-cljs:release
bun run check-generated-cljs-exports:release
```

`type-check-generated-cljs` runs strict TypeScript with `skipLibCheck: false` over the generated declarations.

`check-generated-cljs-exports` verifies that every generated module has a declaration file and compares declared values with `Object.keys(require(module))` from the matching runtime module.

When a change also updates boundary schemas or frontend consumers, run:

```bash
bun run type-check-pure
```

Run the generator tests with:

```bash
./bin/test-agent --cljs \
  :only '[metabase.util.malli.typescript-test metabase.util.malli.typescript.declaration-test metabase.util.malli.typescript.type-test metabase.util.malli.typescript.schema-test metabase.util.malli.typescript.refs-test metabase.util.malli.typescript.build-test]'
```

Run cljfmt after editing Clojure files.

## Precision limits

The compiler widens values when the available schema cannot prove a JavaScript type:

- Missing argument schemas remain `unknown`.
- Custom predicates without structural mappings or `:typescript` remain `unknown`.
- An `unknown` union branch widens the whole union to `unknown`.
- Numeric ranges such as `[:int {:min 1 :max 10}]` compile to `number`; TypeScript cannot express numeric ranges directly.
- Regex schemas compile to `string`; the compiler does not infer template-literal types from arbitrary regular expressions.
- `seqable?` and `coll?` remain `unknown` because ClojureScript collections have no single JavaScript representation.
- Arbitrary serializers, normalization functions, and JavaScript interop cannot be inferred from Malli alone.

The generator resolves `.cljc` registries on the JVM. ClojureScript uses the runtime schemas, so reader conditionals can select different predicates in each environment. Don't infer a JavaScript type from a JVM-only predicate such as `bytes?` or `uri?`. Use `unknown` unless the export performs a documented conversion.

The compiler may add an optional `"__kind"?` phantom property to distinguish structurally identical aliases. Application code doesn't write or read this property at runtime.

When the compiler can't prove a type, it should emit `unknown` or a diagnostic. It shouldn't omit the export or invent a runtime shape.
