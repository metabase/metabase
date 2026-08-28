---
name: add-malli-schemas
description: Use when adding or changing Malli schemas for API endpoints, function contracts, ClojureScript-to-JavaScript boundaries, or generated TypeScript declarations in Metabase
---

# Add Malli schemas

Malli schemas validate actual runtime values. Model the value at the point where validation runs. For an exported ClojureScript boundary, add TypeScript-specific metadata only when ordinary Malli cannot describe the JavaScript representation accurately.

## Choose the boundary first

| Boundary               | Value the schema sees                                                             | Primary concern                              |
| ---------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| API request            | Parsed and coerced request data                                                   | Accepted wire input                          |
| API response           | Clojure values before JSON serialization                                          | Internal return shape                        |
| `mu/defn` contract     | Arguments and return values at the function call                                  | Runtime correctness                          |
| Exported ClojureScript | The same function values plus the JavaScript representation exposed to TypeScript | Runtime correctness and declaration fidelity |

A schema can participate in more than one boundary. Never make runtime validation less accurate just to produce a more convenient TypeScript declaration.

## Reference files

- `dev/src/metabase/util/malli/typescript.md` — complete declaration-generation reference
- `src/metabase/pivot/js.cljs` — focused native JavaScript array and object signatures
- `src/metabase/lib/js.cljs` — exported function signatures, including input-preserving returns
- `src/metabase/warehouses_rest/api.clj` — comprehensive endpoint schemas and custom errors
- `src/metabase/api_keys/api.clj` — response schemas
- `src/metabase/collections_rest/api.clj` — named schema patterns

## Quick checklist

For every schema:

- [ ] Match the value at the actual validation point
- [ ] Reuse registered schemas and `metabase.util.malli.schema` types when possible
- [ ] Use `mr/def` for reusable or complex shapes
- [ ] Represent optionality, nullability, collection kind, and key names accurately
- [ ] Test valid, invalid, optional, and nullable cases as applicable

For API endpoints:

- [ ] Schema route, query, and body params separately
- [ ] Add `:optional true` and defaults where appropriate
- [ ] Add a response schema with `:-` after the route string
- [ ] Add contextual validation errors where they help users

For exported ClojureScript:

- [ ] Confirm the value is a `^:export` var in a Shadow entry namespace
- [ ] Schema known arguments and the return value
- [ ] Prefer ordinary Malli when it describes the JavaScript value faithfully
- [ ] Add TypeScript metadata only for a real native-JavaScript or static-type distinction
- [ ] Run clean dev and release builds, strict declaration checks, and runtime export parity checks

## Basic Structure

### Complete Endpoint Example

```clojure
(mr/def ::Color [:enum "red" "blue" "green"])

(mr/def ::ResponseSchema
  [:map
   [:id pos-int?]
   [:name string?]
   [:color ::Color]
   [:created_at ms/TemporalString]])

(api.macros/defendpoint :post "/:name" :- ::ResponseSchema
  "Create a resource with a given name."
  [;; Route Params:
   {:keys [name]} :- [:map [:name ms/NonBlankString]]
   ;; Query Params:
   {:keys [include archived]} :- [:map
                                   [:include  {:optional true} [:maybe [:= "details"]]]
                                   [:archived {:default false} [:maybe ms/BooleanValue]]]
   ;; Body Params:
   {:keys [color]} :- [:map [:color ::Color]]
   ]
  ;; endpoint implementation, ex:
  {:id 99
   :name (str "mr or mrs " name)
   :color ({"red" "blue" "blue" "green" "green" "red"} color)
   :created_at (t/format (t/formatter "yyyy-MM-dd'T'HH:mm:ssXXX") (t/zoned-date-time))}
  )
```

## Common Schema Patterns

1. Route Params (the 5 in `api/user/id/5`)
2. Query Params (the sort+asc pair in `api/users?sort=asc`)
3. Body Params (the contents of a request body. Almost always decoded from json into edn)
4. The Raw Request map

Of the 4 arguments, deprioritize usage of the raw request unless necessary.

### Route Params

Always required, typically just a map with an ID:

```clojure
[{:keys [id]} :- [:map [:id ms/PositiveInt]]]
```

For multiple route params:

```clojure
[{:keys [id field-id]} :- [:map
                           [:id ms/PositiveInt]
                           [:field-id ms/PositiveInt]]]
```

### Query Params

Add properties for `{:optional true ...}` and `:default` values:

```clojure
{:keys [archived include limit offset]} :- [:map
                                            [:archived {:default false} [:maybe ms/BooleanValue]]
                                            [:include  {:optional true}   [:maybe [:= "tables"]]]
                                            [:limit    {:optional true} [:maybe ms/PositiveInt]]
                                            [:offset   {:optional true} [:maybe ms/PositiveInt]]]
```

### Request Body (POST/PUT)

```clojure
{:keys [name description parent_id]} :- [:map
                                         [:name        ms/NonBlankString]
                                         [:description {:optional true} [:maybe ms/NonBlankString]]
                                         [:parent_id   {:optional true} [:maybe ms/PositiveInt]]]
```

### Response Schemas

#### Simple inline response:

```clojure
(api.macros/defendpoint :get "/:id" :- [:map
                                        [:id pos-int?]
                                        [:name string?]]
  "Get a thing"
  ...)
```

#### Named schema for reuse:

```clojure
(mr/def ::Thing
  [:map
   [:id pos-int?]
   [:name string?]
   [:description [:maybe string?]]])

(api.macros/defendpoint :get "/:id" :- ::Thing
  "Get a thing"
  ...)

(api.macros/defendpoint :get "/" :- [:sequential ::Thing]
  "Get all things"
  ...)
```

## Common Schema Types

### From `metabase.util.malli.schema` (aliased as `ms`)

Prefer the schemas in the ms/\* namespace, since they work better with our api infrastructure.

For example use `ms/PositiveInt` instead of `pos-int?`.

```clojure
ms/PositiveInt                  ;; Positive integer
ms/NonBlankString               ;; Non-empty string
ms/BooleanValue                 ;; String "true"/"false" or boolean
ms/MaybeBooleanValue            ;; BooleanValue or nil
ms/TemporalString               ;; ISO-8601 date/time string (for REQUEST params only!)
ms/Map                          ;; Any map
ms/JSONString                   ;; JSON-encoded string
ms/PositiveNum                  ;; Positive number
ms/IntGreaterThanOrEqualToZero  ;; 0 or positive
```

**IMPORTANT:** For response schemas, use `:any` for temporal fields, not `ms/TemporalString`!
Response schemas validate BEFORE JSON serialization, so they see Java Time objects.

### Built-in Malli Types

```clojure
:string                     ;; Any string
:boolean                    ;; true/false
:int                        ;; Any integer
:keyword                    ;; Clojure keyword
pos-int?                    ;; Positive integer predicate
[:maybe X]                  ;; X or nil
[:enum "a" "b" "c"]         ;; One of these values
[:or X Y]                   ;; Schema that satisfies X or Y
[:and X Y]                  ;; Schema that satisfies X and Y
[:sequential X]             ;; Sequential of Xs
[:set X]                    ;; Set of Xs
[:map-of K V]               ;; Map with keys w/ schema K and values w/ schema V
[:tuple X Y Z]              ;; Fixed-length tuple of schemas X Y Z
```

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

## Step-by-step: Add schemas to an endpoint

### Example: Adding return schema to `GET /api/field/:id/related`

**Before:**

```clojure
(api.macros/defendpoint :get "/:id/related"
  "Return related entities."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (-> (t2/select-one :model/Field :id id) api/read-check xrays/related))
```

**Step 1:** Check what the function returns (look at `xrays/related`)

**Step 2:** Define response schema based on return type:

```clojure
(mr/def ::RelatedEntity
  [:map
   [:tables [:sequential [:map [:id pos-int?] [:name string?]]]]
   [:fields [:sequential [:map [:id pos-int?] [:name string?]]]]])
```

**Step 3:** Add response schema to endpoint:

```clojure
(api.macros/defendpoint :get "/:id/related" :- ::RelatedEntity
  "Return related entities."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (-> (t2/select-one :model/Field :id id) api/read-check xrays/related))
```

## Advanced Patterns

### Custom Error Messages

```clojure
(def DBEngineString
  "Schema for a valid database engine name."
  (mu/with-api-error-message
   [:and
    ms/NonBlankString
    [:fn
     {:error/message "Valid database engine"}
     #(u/ignore-exceptions (driver/the-driver %))]]
   (deferred-tru "value must be a valid database engine.")))
```

### Enum with Documentation

```clojure
(def PinnedState
  (into [:enum {:error/message "pinned state must be 'all', 'is_pinned', or 'is_not_pinned'"}]
        #{"all" "is_pinned" "is_not_pinned"}))
```

### Complex Nested Response

```clojure
(mr/def ::DashboardQuestionCandidate
  [:map
   [:id ms/PositiveInt]
   [:name ms/NonBlankString]
   [:description [:maybe string?]]
   [:sole_dashboard_info
    [:map
     [:id ms/PositiveInt]
     [:name ms/NonBlankString]
     [:description [:maybe string?]]]]])

(mr/def ::DashboardQuestionCandidatesResponse
  [:map
   [:data [:sequential ::DashboardQuestionCandidate]]
   [:total ms/PositiveInt]])
```

### Paginated Response Pattern

```clojure
(mr/def ::PaginatedResponse
  [:map
   [:data [:sequential ::Item]]
   [:total integer?]
   [:limit {:optional true} [:maybe integer?]]
   [:offset {:optional true} [:maybe integer?]]])
```

## Common Pitfalls

### Don't: Forget `:maybe` for nullable fields

```clojure
[:description ms/NonBlankString]  ;; WRONG - fails if nil
[:description [:maybe ms/NonBlankString]]  ;; RIGHT - allows nil
```

### Don't: Forget `:optional true` for optional query params

```clojure
[:limit ms/PositiveInt]  ;; WRONG - required but shouldn't be
[:limit {:optional true} [:maybe ms/PositiveInt]]  ;; RIGHT
```

### Don't: Forget `:default` values for known params

```clojure
[:limit ms/PositiveInt]  ;; WRONG - required but shouldn't be
[:limit {:optional true :default 0} [:maybe ms/PositiveInt]]  ;; RIGHT
```

### Don't: Mix up route params, query params, and body

```clojure
;; WRONG - all in one map
[{:keys [id name archived]} :- [:map ...]]

;; RIGHT - separate destructuring
[{:keys [id]} :- [:map [:id ms/PositiveInt]]
 {:keys [archived]} :- [:map [:archived {:default false} ms/BooleanValue]]
 {:keys [name]} :- [:map [:name ms/NonBlankString]]]
```

### Don't: Use `ms/TemporalString` for Java Time objects in response schemas

```clojure
;; WRONG - Java Time objects aren't strings yet
[:date_joined ms/TemporalString]

;; RIGHT - schemas validate BEFORE JSON serialization
[:date_joined :any]  ;; Java Time object, serialized to string by middleware
[:last_login [:maybe :any]]  ;; Java Time object or nil
```

**Why:** Response schemas validate the internal Clojure data structures BEFORE they are serialized to JSON. Java Time objects like `OffsetDateTime` get converted to ISO-8601 strings by the JSON middleware, so the schema needs to accept the raw Java objects.

### Don't: Use `[:sequential X]` when the data is actually a set

```clojure
;; WRONG - group_ids is actually a set
[:group_ids {:optional true} [:sequential pos-int?]]

;; RIGHT - matches the actual data structure
[:group_ids {:optional true} [:maybe [:set pos-int?]]]
```

**Why:** Toucan hydration methods often return sets. The JSON middleware will serialize sets to arrays, but the schema validates before serialization.

### Don't: Create anonymous schemas for reused structures

Use `mr/def` for schemas used in multiple places:

```clojure
(mr/def ::User
  [:map
   [:id pos-int?]
   [:email string?]
   [:name string?]])
```

## Finding Return Types

1. **Look at the function being called**

```clojure
(api.macros/defendpoint :get "/:id"
  [{:keys [id]}]
  (t2/select-one :model/Field :id id))  ;; Returns a Field instance
```

2. **Check Toucan models for structure**

Look in `src/metabase/*/models/*.clj` for model definitions.

3. **Use clojure-mcp or REPL to inspect**

```bash
./bin/mage -repl '(require '\''metabase.xrays.core) (doc metabase.xrays.core/related)'
```

4. **Check tests**

Tests often show the expected response structure.

## Understanding Schema Validation Timing

**CRITICAL CONCEPT:** Schemas validate at different points in the request/response lifecycle:

### Request Parameter Schemas (Query/Body/Route)

- Validate AFTER JSON parsing
- Data is already deserialized (strings, numbers, booleans)
- Use `ms/TemporalString` for date/time inputs
- Use `ms/BooleanValue` for boolean query params

### Response Schemas

- Validate BEFORE JSON serialization
- Data is still in Clojure format (Java Time objects, sets, keywords)
- Use `:any` for Java Time objects
- Use `[:set X]` for sets
- Use `[:enum :keyword]` for keyword enums

### Serialization Flow

```
Request:  JSON string → Parse → Coerce → Handler
Response: Handler → Schema Check → Encode → Serialize → JSON string
```

## Workflow summary

1. **Identify the boundary** — API request, API response, function contract, or exported JavaScript.
2. **Inspect the runtime value** — include representation before serialization or after interop conversion.
3. **Write ordinary Malli first** — reuse registered schemas and `ms` types.
4. **Add boundary metadata only if needed** — describe native JavaScript or an exact static relationship without weakening runtime validation.
5. **Test runtime behavior** — cover valid, invalid, optional, and nullable values.
6. **Validate generated declarations when applicable** — clean-build both modes, then run strict and runtime-parity checks.

## Testing Your Schemas

After adding schemas, verify:

1. **Valid requests work** - test with correct data
2. **Invalid requests fail gracefully** - test with wrong types
3. **Optional params work** - test with/without optional params
4. **Error messages are clear** - check validation error responses

## Tips

- **Start simple** - begin with basic types, refine later
- **Reuse schemas** - if you see the same structure twice, make it a named schema
- **Be specific** - use `ms/PositiveInt` instead of `pos-int?`
- **Document intent** - add docstrings to named schemas
- **Follow conventions** - look at similar endpoints in the same namespace
- **Check the actual data** - use REPL to inspect what's actually returned before serialization

## Additional resources

- [Malli documentation](https://github.com/metosin/malli)
- Metabase Malli utilities: `src/metabase/util/malli/schema.clj`
- Metabase schema registry: `src/metabase/util/malli/registry.clj`
- TypeScript declaration guide: `dev/src/metabase/util/malli/typescript.md`
