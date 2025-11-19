---
name: add-malli-schemas
description: Efficiently add Malli schemas to API endpoints in the Metabase codebase with proper patterns, validation timing, and error handling
---

# Add Malli Schemas to API Endpoints

This skill helps you efficiently and uniformly add Malli schemas to API endpoints in the Metabase codebase.

## Reference Files (Best Examples)

- `src/metabase/warehouses/api.clj` - Most comprehensive schemas, custom error messages
- `src/metabase/api_keys/api.clj` - Excellent response schemas
- `src/metabase/collections/api.clj` - Great named schema patterns
- `src/metabase/timeline/api/timeline.clj` - Clean, simple examples

## Quick Checklist

When adding Malli schemas to an endpoint:

- [ ] Route parameters have schemas
- [ ] Query parameters have schemas with `:optional true` and `:default` where appropriate
- [ ] Request body has schema (for POST/PUT)
- [ ] Response schema is defined (using `:-` after route string)
- [ ] Use existing schema types from `ms` namespace when possible
- [ ] Consider creating named schemas for reusable/complex types
- [ ] Add custom error messages for validation failures

## Basic Structure

### Complete Endpoint Example

```clojure
(mr/def ::ResponseSchema
  [:map
   [:id pos-int?]
   [:name string?]
   [:created_at ms/TemporalString]])

(api.macros/defendpoint :get "/:id" :- ::ResponseSchema
  "Fetch a resource by ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [include archived]} :- [:map
                                   [:include  {:optional true} [:maybe [:= "details"]]]
                                   [:archived {:default false} [:maybe ms/BooleanValue]]]]
  ;; implementation
  )
```

## Common Schema Patterns

### Route Parameters

Always required, typically just an ID:

```clojure
[{:keys [id]} :- [:map
                  [:id ms/PositiveInt]]]
```

For multiple route params:

```clojure
[{:keys [id field-id]} :- [:map
                           [:id ms/PositiveInt]
                           [:field-id ms/PositiveInt]]]
```

### Query Parameters

Use `:optional true` and `:default` values:

```clojure
{:keys [archived include limit offset]} :- [:map
                                            [:archived {:default false} [:maybe ms/BooleanValue]]
                                            [:include  {:optional true} [:maybe [:= "tables"]]]
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

```clojure
ms/PositiveInt              ;; Positive integer
ms/NonBlankString           ;; Non-empty string
ms/BooleanValue             ;; String "true"/"false" or boolean
ms/MaybeBooleanValue        ;; BooleanValue or nil
ms/TemporalString           ;; ISO-8601 date/time string (for REQUEST params only!)
ms/Map                      ;; Any map
ms/JSONString               ;; JSON-encoded string
ms/PositiveNum              ;; Positive number
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
[:or X Y]                   ;; X or Y
[:and X Y]                  ;; X and Y
[:sequential X]             ;; Sequential of X
[:set X]                    ;; Set of X
[:map-of K V]               ;; Map with keys K and values V
[:tuple X Y Z]              ;; Fixed-length tuple
```

## Step-by-Step: Adding Schemas to an Endpoint

### Example: Adding schema to `GET /api/field/:id/related`

**Before:**
```clojure
(api.macros/defendpoint :get "/:id/related"
  "Return related entities."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
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
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
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
  (into [:enum {:error/message "must be 'all', 'is_pinned', or 'is_not_pinned'"}]
        #{"all" "is_pinned" "is_not_pinned"}))
```

### Complex Nested Response

```clojure
(mr/def ::DashboardQuestionCandidate
  [:map
   [:id pos-int?]
   [:name string?]
   [:description [:maybe string?]]
   [:sole_dashboard_info
    [:map
     [:id pos-int?]
     [:name string?]
     [:description [:maybe string?]]]]])

(mr/def ::DashboardQuestionCandidatesResponse
  [:map
   [:data [:sequential ::DashboardQuestionCandidate]]
   [:total integer?]])
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
[:description string?]  ;; WRONG - fails if nil
[:description [:maybe string?]]  ;; RIGHT - allows nil
```

### Don't: Forget `:optional true` for optional query params

```clojure
[:limit ms/PositiveInt]  ;; WRONG - required
[:limit {:optional true} [:maybe ms/PositiveInt]]  ;; RIGHT
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

3. **Use REPL to inspect**

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
Request:  JSON string → Parse → Validate → Handler
Response: Handler → Validate → Serialize → JSON string
                    ↑
                Schema checks here!
```

## Workflow Summary

1. **Read the endpoint** - understand what it does
2. **Identify parameters** - route, query, body
3. **Add parameter schemas** - use existing types from `ms`
4. **Determine return type** - check the implementation
5. **Define response schema** - inline or named with `mr/def`
6. **Test** - ensure the endpoint works and validates correctly

## Testing Your Schemas

After adding schemas, verify:

1. **Valid requests work** - test with correct data
2. **Invalid requests fail gracefully** - test with wrong types
3. **Optional parameters work** - test with/without optional params
4. **Error messages are clear** - check validation error responses

## Tips

- **Start simple** - begin with basic types, refine later
- **Reuse schemas** - if you see the same structure twice, make it a named schema
- **Be specific** - use `ms/PositiveInt` instead of just `:int` when appropriate
- **Document intent** - add docstrings to named schemas
- **Follow conventions** - look at similar endpoints in the same namespace
- **Check the actual data** - use REPL to inspect what's actually returned before serialization

## Additional Resources

- [Malli Documentation](https://github.com/metosin/malli)
- Metabase Malli utilities: `src/metabase/util/malli/schema.clj`
- Metabase schema registry: `src/metabase/util/malli/registry.clj`
