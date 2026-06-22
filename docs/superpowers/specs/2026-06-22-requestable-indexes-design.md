# GDGT-2654 — Expose requestable index types on the transform fetch

**Status:** Design (revised after agent review)
**Branch:** `gdgt-2654-supported-index-types` (stacked on `gdgt-2607-merge-managed-warehouse-hints`)
**Ticket:** https://linear.app/metabase/issue/GDGT-2654
**Reference design:** https://linear.app/metabase/document/tech-doc-9bf1077786bd (Index Manager tech doc)

## Problem

The Index Manager UI lets a user declare indexes on a transform's target table. To render the
"create index" form it must know, for that specific warehouse, **which index kinds can be requested and
what each one's form looks like** (does btree allow `UNIQUE`? what `style` values does a Redshift
sortkey accept? what `type` values does a ClickHouse skip-index accept?).

That knowledge does not reach the frontend today. `driver/supported-index-methods` (`driver.clj:1569`)
already enumerates the supported kinds, but it is consumed only internally (the transform run engine,
`transforms_base/util.clj:578`) and carries only `:lifecycle`. Without an API the FE would hard-code
per-warehouse rules, exactly what the ticket says to avoid:

> Drive the available options from driver capabilities rather than hard-coding per warehouse in the FE.

## Goal

Expose, per transform target, a self-describing capability map the FE renders a form from with **zero
per-warehouse branching**, then POSTs to the existing `POST /api/indexes/request`.

Non-goals (Phase 0 / tech-doc "out of scope"):
- Index kinds beyond what the 3 supported drivers create **today** (postgres btree; clickhouse
  order-by + skip-index; redshift sortkey). Expanding the kind set and driver set is the next phase.
- Managing indexes on non-transform tables.
- Per-column / column-type eligibility ("gin only on jsonb"). Capability is per-(driver,table) today.
- Partial / expression / operator-class indexes; covering (`INCLUDE`) columns; skip-index `:type-args`.
  These are raw-form / later-milestone.

## Scope boundary (important)

This ticket exposes the **capability data** only. The mechanics of applying a *managed* index request on
a transform run (`apply-target-indexes!`, `verify-managed-indexes!`, the reconcile flow) are owned by the
sibling branches in this stack, not here. We expose the kinds the drivers already render/create
(`compile-create-index` for standalone; the CTAS/`create-table!` seams for inline), which is the set
`supported-index-methods` advertises today.

## Key decision: enrich `supported-index-methods`, shared helpers in `driver.common`

Model the form descriptor on `driver/connection-properties` (`driver.clj:506`, `ConnectionDetailsProperty`
at `:474`): the backend returns field descriptors and the FE renders generically. That pattern uses **one
method + shared helpers** (in `metabase.driver.common`: `default-host-details`, …), not a separate
"template + toggles" layer. We do the same:

- `supported-index-methods` is **enriched** to return, per kind, `{:lifecycle … :fields [<descriptor>…]}`.
  `:lifecycle` is unchanged (still the only key the run engine reads).
- Shared field helpers live in **`metabase.driver.common`** (NOT `metabase.indexes.*`).

**Why `driver.common` and not `metabase.indexes.fields`:** the `indexes` module already `:uses driver`
(`.clj-kondo/config/modules/config.edn`), so a driver namespace requiring `metabase.indexes.fields` would
create a circular module dependency (`driver → indexes`) that `metabase.core.modules-test` rejects.
`driver.common` is inside the `driver` module, exactly where the analogous `connection-properties`
helpers already live, and every driver already requires it. The helpers hard-code the option keywords
(`:compound`, `:minmax`, …) as literals; they do **not** require `indexes.schema`. The anti-drift test
(below) lives in the `indexes` test tree, which may require both.

Rejected: a separate multimethod (forces drivers to keep two methods in sync); a new field-description
DSL (reuse the `connection-properties` vocabulary so the shape matches what the FE already parses).

## Data shape

### Enriched `supported-index-methods` return value

`{index-kind {:lifecycle (:standalone|:inline), :fields [<field-descriptor> …]}}`, e.g.:

```clojure
;; postgres  (driver/common helpers use deferred-tru, like connection-properties)
{:btree {:lifecycle :standalone
         :fields [(common/index-name-field)      ; required string, the physical index name
                  (common/index-columns-field)]}} ; required column picker, direction-capable
;; + an unique boolean field (common/index-unique-field). :include deferred (see non-goals).

;; clickhouse
{:order-by   {:lifecycle :inline
              :fields [(common/index-columns-field)]}
 :skip-index {:lifecycle :standalone
              :fields [(common/index-name-field)
                       (common/index-columns-field)
                       {:name "type" :display-name (deferred-tru "Type") :type :select :required true
                        :options {:minmax       (deferred-tru "Min/max")
                                  :set          (deferred-tru "Set")
                                  :bloom_filter (deferred-tru "Bloom filter")
                                  :ngrambf_v1   (deferred-tru "N-gram bloom filter")
                                  :tokenbf_v1   (deferred-tru "Token bloom filter")}}
                       (common/index-granularity-field)]}} ; optional positive int

;; redshift
{:sortkey {:lifecycle :inline
           :fields [(common/index-columns-field)
                    {:name "style" :display-name (deferred-tru "Style") :type :select :required true
                     :options {:compound (deferred-tru "Compound") :interleaved (deferred-tru "Interleaved")}}]}}

;; h2 / any non-index driver -> {}  (the :default method, unchanged)
```

`order-by` and `sortkey` are unnamed inline kinds (their `::index-structured` branches have no `:name`),
so they get **no** name field; `reconcile/index-name` derives `"order-by"`/`"sortkey"` server-side.

### Field-descriptor vocabulary

**Byte-for-byte the `ConnectionDetailsProperty` shape** (`driver.clj:474`) plus one new `:type`, so the
descriptors serialize identically to how DB-connection form fields already reach the FE and can reuse the
same parsing:

| key             | meaning                                                                 |
|-----------------|-------------------------------------------------------------------------|
| `:name`         | the key to write into the `structured` POST body (e.g. `"unique"`, `"type"`) |
| `:display-name` | i18n label, built with **`deferred-tru`**                               |
| `:type`         | `:string` · `:boolean` · `:select` · `:integer` · **`:columns`** (new)   |
| `:required`     | bare boolean (matches `ConnectionDetailsProperty`; NOT `:required?`); defaults false |
| `:options`      | `{enum-keyword deferred-i18n-label}` for `:select`; keys == the kind's schema enum values |
| `:directions`   | `:columns` only: whether per-column asc/desc is offered                  |

`:columns` is the only new type: a multi-select over the **table's** columns, emitting
`[{:name "..", :direction "asc"?}]` (maps to `::column`). `index-columns-field` sets `:directions true`.
The FE sources the table's column list from existing table metadata it already has for the target
table (out of scope to add here); the descriptor only says "this is a column picker."

**Note on `:columns` and FE work:** `:select`/`:boolean`/`:string` reuse the connection-form renderer,
but `:columns` genuinely needs a new FE control (column multi-select + direction). The "reuse the
renderer" benefit is real for the scalar fields, partial for `:columns`.

### Invariants (enforced by tests, not just prose)

1. **Descriptor ⟺ schema.** Every field `:name`, and every `:options` key, corresponds to a key / enum
   value in that kind's branch of `::index-structured` (`indexes/schema.clj`). A `:select`'s `:options`
   keys **equal** the schema enum exactly (not sub/superset). Each kind's *required* schema keys are all
   produced by some field (or are `:kind`/columns). Tested by assembling a body **only** from the
   descriptors (+ `:kind` from the map key), running `keywordize-structured`, and validating against
   `::index-structured`.
2. **Lifecycle ⟺ feature flag.** A kind with `:lifecycle :standalone` ⟺ `database-supports?
   :index/standalone-create`; `:inline` ⟺ `:index/inline-create`. Tested per advertised kind.
3. **`:kind` is implicit.** The FE sends the `requestable_indexes` map **key** as the body's `:kind`.
   There is intentionally no descriptor for `:kind`. Documented in the response-schema comment.

## API — `GET /api/transform/:id`

Per the user's decision, the capability map is attached to the **single-transform fetch**, not the index
list. (Trade-off acknowledged: `TransformResponse` is large and `{:closed true}`, shared by the list /
POST / PUT endpoints, and the FE still calls `GET /api/indexes?transform-id=` for the existing index
list. We add the field `{:optional true}` so the other endpoints, which don't set it, still validate.)

- `transforms.core/get-transform` (`crud.clj:110`) assocs `:requestable_indexes`. **Only** this fn, so the
  list endpoint (`get-transforms`) and POST/PUT are untouched.
- `TransformResponse` (`transforms_rest/api/transform.clj:76`) gains
  `[:requestable_indexes {:optional true} [:maybe [:map-of :keyword RequestableIndex]]]`.

### Computing it (with the nil/error guards the reviewers required)

```
db-id := (transforms-base.i/target-db-id transform)   ; correct for query transforms too (not (:target …):database)
if db-id nil  -> :requestable_indexes nil              ; e.g. OSS Python transform, default impl returns nil
db    := (t2/select-one :model/Database db-id)
if db nil     -> nil                                    ; target db deleted
methods := try (supported-index-methods (:engine db) db) catch -> nil   ; mirror fetch-warehouse-indexes' graceful swallow
:requestable_indexes := (when (seq methods) methods)    ; empty map -> nil, enforced in code, per "just make it nil"
```

### Response schema (Malli, in `transform.clj`)

```clojure
(def ^:private IndexFieldDescriptor
  [:map
   [:name :string]
   [:display-name [:or :string :any]]            ; deferred-i18n resolves to string at serialization
   [:type [:enum :string :boolean :select :integer :columns]]
   [:required {:optional true} :boolean]
   [:directions {:optional true} :boolean]
   [:options {:optional true} [:map-of :keyword [:or :string :any]]]])

(def ^:private RequestableIndex
  [:map
   [:lifecycle [:enum :standalone :inline]]
   [:fields [:sequential IndexFieldDescriptor]]])
;; TransformResponse gains:
;;   [:requestable_indexes {:optional true} [:maybe [:map-of :keyword RequestableIndex]]]
```

Keyword values (kind keys, `:type`, `:lifecycle`, option keys) serialize to strings in JSON as
everywhere else. The descriptor keys (`:display-name`, etc.) serialize exactly as `connection-properties`
descriptors already do.

## Files touched

| File | Change |
|------|--------|
| `src/metabase/driver.clj` | Update `supported-index-methods` docstring for the `:fields` shape. |
| `src/metabase/driver/common.clj` | New shared helpers: `index-name-field`, `index-columns-field`, `index-unique-field`, `index-granularity-field` (using `deferred-tru`). |
| `src/metabase/driver/postgres.clj` | btree `:fields` (drop the now-vestigial flat `:unique true`). |
| `modules/drivers/clickhouse/.../clickhouse.clj` | order-by + skip-index `:fields`; switch i18n import to `deferred-tru`. |
| `modules/drivers/redshift/.../redshift.clj` | sortkey `:fields`; add `deferred-tru` import. |
| `src/metabase/transforms/crud.clj` | `get-transform` computes + assocs `:requestable_indexes` (with guards). |
| `src/metabase/transforms_rest/api/transform.clj` | `TransformResponse` + the two descriptor schemas. |
| `test/metabase/driver/postgres/index_test.clj` | Update assertion to the enriched map. |
| `modules/drivers/clickhouse/test/.../index_test.clj` | Update assertion. |
| `modules/drivers/redshift/test/.../index_test.clj` | Update assertion. |
| `test/metabase/.../indexes_*_test.clj` (indexes module) | Descriptor⟺schema round-trip + lifecycle⟺flag invariants. |
| transform api/crud test | `requestable_indexes` present for postgres-backed transform; nil for unsupported driver / missing db. |

`apply-standalone-indexes!` (`transforms_base/util.clj:578`) is **unchanged** — reads only `:lifecycle`.

The flat `:unique true` in postgres's current return (`postgres.clj:1421`) has **no reader**
(`:unique` is only read off the `structured` body, `reconcile.clj:72`), so removing it is safe; the
postgres `index_test.clj:21` assertion is updated in the same change. The `with-redefs` stub in
`test/metabase/transforms/index_test.clj:238` (`{:btree {:lifecycle :standalone}}`) still satisfies the
run engine.

## Testing

- **Driver unit tests** (pure): each driver's `supported-index-methods` returns the expected enriched
  map; h2 still `{}`.
- **Descriptor⟺schema round-trip** (anti-drift, in the indexes module): for each advertised kind across
  the 3 drivers, build a body from descriptors only + `:kind`, `keywordize-structured`, assert it
  validates against `::index-structured`; assert every `:select`'s `:options` keys equal the schema enum;
  assert all required schema keys are covered.
- **Lifecycle⟺feature-flag** invariant per advertised kind.
- **Transform fetch test:** `GET /api/transform/:id` includes `:requestable_indexes` for a
  postgres-backed transform; `nil` for an unsupported driver and for a deleted target db; list/POST/PUT
  responses unaffected.

## Known gaps (documented, not fixed here)

- `POST /api/indexes/request` validates only `[:structured :map]` (`api.clj:84`), not `::index-structured`.
  Tightening it is a separate concern; flagged so the round-trip test isn't mistaken for request-path
  validation.
- A user-supplied index `:name` can collide with a non-managed physical index; `compile-create-index`
  fails at DDL time rather than at POST. Pre-existing, out of scope.
