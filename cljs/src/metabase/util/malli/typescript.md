# Generating TypeScript declarations from Malli schemas

The Malli-to-TypeScript declaration compiler generates `.d.ts` files for ClojureScript namespaces listed in the Shadow `app` build's `:entries` in `shadow-cljs.edn`. Within each entry namespace, it declares values exported to JavaScript and derives their types from Malli schemas.

Existing Malli tooling can validate, transform, generate, and translate data schemas. It does not inspect Shadow entry modules, enumerate JavaScript exports, or generate TypeScript relationships such as type predicates and correlated generics. This compiler keeps Malli as the source schema while adding the export and boundary information needed for `.d.ts` files.

## TypeScript metadata

This compiler introduces custom Malli notation for **TypeScript metadata**. The notation uses compiler-owned properties in a Malli schema's property map. It is not part of TypeScript or standard Malli. Keys such as `:typescript` and `:ts/array-of` are annotations that the declaration compiler reads in addition to the Malli schema.

For example:

```clojure
[:any {:ts/array-of :string}]
```

Malli still sees `:any`, so the annotation does not replace the runtime validator with a sequential schema. The declaration compiler additionally knows that JavaScript receives a native array:

```ts
string[]
```

This extra information is necessary when:

- the Malli schema is intentionally permissive at runtime;
- ClojureScript converts a value before returning it to JavaScript; or
- TypeScript needs a relationship, such as argument narrowing or preserving an input subtype, that Malli does not express.

Keeping this information as schema metadata avoids two problems: changing runtime validation only to improve TypeScript output, and maintaining a separate handwritten declaration that can drift from the Malli schema. Use ordinary Malli whenever it already describes the JavaScript value. Add TypeScript metadata only for the missing boundary or relationship.

## Generating declarations for JavaScript exports

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

The examples in this guide omit generated JSDoc comments so the declaration itself is easier to see.

The Shadow `app` build hook writes declarations beside the compiled JavaScript during the `:flush` stage:

- development: `target/cljs_dev`
- release: `target/cljs_release`

Each generated value module corresponds to a module that JavaScript can import. A public ClojureScript var without export metadata does not get a value declaration. A schema in an internal dependency namespace does not create a declaration module by itself.

If an exported value has no usable schema, the compiler keeps the runtime export visible and uses a conservative fallback:

```clojure
(defn ^:export transform [value]
  ...)
```

```ts
export function transform(value: unknown): unknown;
```

Rest arguments fall back to `unknown[]`, and constants fall back to `unknown`. The compiler does not invent a type it cannot prove.

## Using ordinary Malli for ordinary values

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

Malli already contains enough information for these forms, so they need no TypeScript metadata.

### Keeping open and closed maps distinct

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

If multiple Malli keys become the same TypeScript property, the compiler emits one property with a union of the contributing types and records a `:map-key-collision` diagnostic.

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

### Compiling sequence expressions as flat tuples

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

Malli already models this positional structure. The compiler's job is to preserve it without creating nested tuples or invalid rest elements.

### Compiling multi-arity functions as overload intersections

A Malli `:function` schema means one function supports all listed signatures:

```clojure
[:function
 [:=> [:cat :string] :int]
 [:=> [:cat :string :int] :int]]
```

```ts
((arg0: string) => number) & ((arg0: string, arg1: number) => number);
```

An intersection represents an overloaded callable. A union would mean the value is only one of the functions and would make many valid calls impossible.

### Reusing registry schemas as named aliases

A qualified registry key becomes a TypeScript alias:

```clojure
:metabase.lib.schema.metadata/column
```

```ts
Metabase_Lib_Schema_Metadata_Column;
```

Global aliases reachable from exported signatures are written to `metabase.lib.shared.d.ts`. Entry modules refer to them through a type-only import:

```ts
import type * as Shared from "./metabase.lib.shared";

export function display_info(
  column: Shared.Metabase_Lib_Schema_Metadata_Column,
): unknown;
```

Inline `:schema` registries remain in the entry declaration that owns them. Recursive references through an object, array, tuple, or function remain recursive. An unsafe direct alias cycle widens only the unsafe edge to `unknown` and records a diagnostic.

## Describing JavaScript boundary conversions

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

Do not add TypeScript metadata only to make a declaration look nicer. The metadata must describe the real JavaScript value.

### Describing a native JavaScript array with `:ts/array-of`

A function returning `to-array` returns a JavaScript array, not a ClojureScript sequence:

```clojure
[:any {:ts/array-of [:maybe :string]}]
```

```ts
(string | null)[]
```

Malli alone cannot express this distinction without changing runtime validation. `[:sequential T]` validates a Clojure sequence, while `:ts/array-of` describes the native array returned at the JavaScript boundary.

### Describing a native JavaScript object with `:ts/object-of`

A function returning `#js {}` is not returning a ClojureScript map:

```clojure
[:any {:ts/object-of
       [:map {:closed true}
        [:operator :string]
        [:args [:any {:ts/array-of :any}]]]}]
```

```ts
{
  operator: string;
  args: unknown[];
}
```

A Malli `:map` describes a Clojure map and its runtime validation. `:ts/object-of` preserves permissive validation while describing the object JavaScript actually receives.

### Describing converted object keys with `:ts/key-transform`

Use `:ts/key-transform :camelCase` only when the implementation converts keys to camel case:

```clojure
[:any {:ts/object-of
       [:map {:closed true}
        [:display-name :string]
        [:filter-positions {:optional true} [:sequential :int]]
        [:many-pks? {:optional true} :boolean]]
       :ts/key-transform :camelCase}]
```

```ts
{
  displayName: string;
  filterPositions?: number[];
  isManyPks?: boolean;
}
```

Plain Malli sees the original keys and does not know that the JavaScript serializer renames them. The compiler applies the transform recursively. A nested `:ts/object-of` can reset an inherited transform with `:ts/key-transform :none`.

For simple string keys, the compiler can use its generated `Camel<...>` mapped type instead of expanding every transformed key:

```clojure
[:any {:ts/object-of
       [:map {:closed true}
        ["display-name" :string]
        ["enabled?" {:optional true} :boolean]]
       :ts/key-transform :camelCase}]
```

```ts
Camel<{
  "display-name": string;
  "enabled?"?: boolean;
}>;
```

When an entry module imports shared aliases, the same expression appears as `Shared.Camel<...>`.

### Naming an exact TypeScript type with `:typescript`

Use `:typescript` when the boundary has an exact TypeScript type that Malli cannot derive:

```clojure
(def ^:export ^{:schema [:any {:typescript "RegExp"}]}
  data-image-uri-pattern
  #"^data:image/")
```

```ts
export const data_image_uri_pattern: RegExp;
```

A Clojure regular-expression predicate does not identify the JavaScript representation during JVM-side generation. `:typescript` supplies the boundary type without tightening runtime validation.

The same property can annotate a predicate schema:

```clojure
[:fn {:typescript "bigint"} bigint?]
```

```ts
bigint;
```

The compiler does not evaluate that predicate merely to render the explicit type.

### Pointing to a registry alias with `:ts/ref`

Use `:ts/ref` when runtime validation must stay permissive but the JavaScript contract has a known registry type:

```clojure
[:any {:ts/ref ::lib.schema.metadata/column}]
```

In an entry declaration, the compiler emits:

```ts
Shared.Metabase_Lib_Schema_Metadata_Column;
```

Plain `:any` correctly describes the runtime validation but compiles to `unknown`. `:ts/ref` adds the known TypeScript boundary without replacing the runtime schema. Direct `schema->ts` calls return the unqualified alias because they do not have entry-module import context.

### Describing a JavaScript promise with `:ts/promise-of`

```clojure
[:any {:ts/promise-of :string}]
```

```ts
Promise<string>;
```

Malli validates realized values and does not wait for a JavaScript promise. `:ts/promise-of` describes the asynchronous container at the export boundary.

### Normalizing JavaScript instance checks

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

The JVM generator cannot resolve `js/Array` or `js/Object` as JVM classes. Prefer `:ts/array-of` or `:ts/object-of` when the element or property schema is known. Authors generally should not write `:ts/instance-of` directly.

## Describing TypeScript relationships that Malli does not model

Some TypeScript types express relationships between values rather than the shape of one value. These need explicit compiler metadata or compiler inference.

### Narrowing an argument with `:ts/predicate-of`

A predicate can declare what a `true` result guarantees:

```clojure
(mu/defn ^:export is-date? :- [:boolean {:ts/predicate-of :string}]
  [value :- :any]
  (string? value))
```

```ts
export function is_date_QMARK_(value: unknown): value is string;
```

Plain Malli knows only that the function returns a boolean. It does not encode the relationship between `true` and the argument's type. A TypeScript type predicate gives consumers control-flow narrowing:

```ts
if (is_date_QMARK_(value)) {
  value.toUpperCase(); // value is string here
}
```

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

The predicate target must be a sound guarantee. A function that can return `true` for values outside the target schema must not declare `:ts/predicate-of`.

### Emitting a discriminated union with `:ts/dispatch-key`

A keyword-dispatched Malli `:multi` is detected automatically:

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

When `:dispatch` is an arbitrary function, Malli can execute it but the declaration compiler cannot determine which property it reads. Declare the direct key with `:ts/dispatch-key`:

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

### Preserving an input subtype with `:ts/same-as`

Malli can validate that an argument and return value satisfy the same broad schema, but it does not state that the function preserves the argument's specific subtype. The compiler detects an unambiguous identical registry-typed argument and return automatically:

```clojure
(ns metabase.example
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli :as mu]))

(mr/def ::value :string)

(mu/defn ^:export identity-like :- ::value
  [value :- ::value]
  value)
```

```ts
export function identity_like<T extends Shared.Metabase_Example_Value>(
  value: T,
): T;
```

Use `:ts/same-as` when the correlation is not mechanically obvious:

```clojure
(mu/defn ^:export with-binning
  :- [:schema {:ts/same-as 0
               :ts/generic-bound
               [:or ::lib.schema.metadata/column
                    ::lib.schema.ref/ref]}
      ::lib.schema.metadata/column]
  [column-or-clause
   binning-option]
  ...)
```

```ts
export function with_binning<
  T extends
    | Shared.Metabase_Lib_Schema_Metadata_Column
    | Shared.Metabase_Lib_Schema_Ref_Ref,
>(column_or_clause: T, binning_option: unknown): T;
```

`:ts/same-as 0` ties the return to argument index `0`. `:ts/generic-bound` supplies the full accepted input domain when the nominal return schema is narrower.

Use this only when the implementation preserves the input kind. It is not a substitute for a transformation schema.

## Controlling compiler output

### Emitting readonly containers

Set `MB_CLJS_TS_READONLY=1` to make value-position containers immutable:

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

Inline container types in function parameters remain mutable, so readonly generation does not narrow those accepted inputs. Registry-backed parameters can still refer to readonly aliases. Malli validates collection contents but does not encode TypeScript mutation rules. Readonly output is opt-in because consumers must copy a value before mutating it.

### Inspecting weak fallback types

Set `MB_DEBUG_CLJS` to report generated `any` and `unknown` fallback types:

```bash
MB_DEBUG_CLJS=1 bun run build-pure:cljs
```

Use verbose mode to list the affected exports:

```bash
MB_DEBUG_CLJS=verbose bun run build-pure:cljs
```

## Calling the compiler facade directly

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

## Building and verifying declarations

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

The generator resolves `.cljc` registries on the JVM, while ClojureScript validates runtime values. Reader-conditional schemas can therefore expose different predicates in each environment. Do not infer a JavaScript type from a JVM-only predicate such as `bytes?` or `uri?`; use `unknown` unless the exported boundary performs a documented conversion.

Structurally identical aliases may receive an optional compiler-owned `"__kind"?` phantom property so TypeScript can distinguish them. Authors do not write or read this property at runtime.

A precision limit should produce `unknown` or a diagnostic, not a missing export or an invented runtime shape.
