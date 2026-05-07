(ns metabase-enterprise.workspaces.models.table-remapping
  "Toucan 2 model for the `table_remapping` table. Maps production tables to workspace tables
   for query remapping.

   ## Nil → `\"\"` coercion on writes & lookups

   The columns `from_db`, `from_schema`, `to_db`, `to_schema` use `\"\"` as a
   storage sentinel meaning \"this driver doesn't emit this AST level.\" The
   sentinel is needed because Postgres/MySQL/H2 treat NULL as not-equal-to-NULL
   in unique indexes — without `\"\"`, the unique constraint
   `(database_id, from_db, from_schema, from_table_name)` wouldn't enforce
   uniqueness for rows with absent slots.

   `before-insert` / `before-update` / `before-select` coerce nil (or absent
   on the write side) to `\"\"` for the four sentinel columns. App code can
   pass nil for an absent slot in any of those operations:

     (t2/insert! :model/TableRemapping {:database_id 7 :from_table_name \"ft\" :to_table_name \"tt\"})
     (t2/select-one :model/TableRemapping :database_id 7 :from_db nil :from_table_name \"ft\")

   Reads return rows verbatim — `\"\"` shows up in the four sentinel columns.
   The internal store API (`metabase-enterprise.workspaces.remapping.core`) and
   3-tuple representation are `\"\"`-shaped throughout; callers above the store
   layer that want nil semantics translate locally via
   `metabase-enterprise.workspaces.table-remapping/{denormalize-level,
   store-tuple->table-spec}`.

   ## Cache invalidation

   Inserting or deleting a `TableRemapping` row invalidates the QP results cache for the
   affected `database_id`. Without this, a query cached *before* a remap was registered
   would return canonical-table results forever — Phase 2's SQL rewriter never runs on
   cache hits, so a stale entry silently breaches workspace isolation.

   The invalidation bumps `cache_config.invalidated_at` for the database, which is
   consulted by [[metabase.query-processor.middleware.cache-backend.db/select-cache]]
   on every cache read."
  (:require
   [metabase.cache.core :as cache]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TableRemapping [_model] :table_remapping)

(doto :model/TableRemapping
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(def ^:private sentinel-columns
  "Columns that use `\"\"` as the empty-slot sentinel in storage. The unique
   constraint on `(database_id, from_db, from_schema, from_table_name)` won't
   enforce uniqueness if any of these is NULL (Postgres/MySQL/H2 treat NULL
   as not-equal-to-NULL in indexes), so writes coerce missing-or-nil values
   to `\"\"` here. App code can pass nil or omit the column; the model fills
   in the sentinel."
  [:from_db :from_schema :to_db :to_schema])

(defn- coerce-sentinels-write
  "On insert/update: for each sentinel-bearing column, ensure the row carries
   `\"\"` instead of nil or absent. The unique constraint demands all four
   columns be non-null, so missing keys get filled in with the sentinel."
  [m]
  (reduce (fn [acc k]
            (if (or (not (contains? acc k))
                    (nil? (get acc k)))
              (assoc acc k "")
              acc))
          m
          sentinel-columns))

(defn- coerce-sentinels-match
  "On select/delete kv-args: translate explicitly-passed nil to `\"\"` so a
   `WHERE from_db = NULL` (never matches) becomes `WHERE from_db = \"\"`. Do
   NOT touch absent keys — that would add unwanted predicates to broad
   lookups like `(t2/select :model/TableRemapping :database_id 7)`."
  [m]
  (reduce (fn [acc k]
            (if (and (contains? acc k) (nil? (get acc k)))
              (assoc acc k "")
              acc))
          m
          sentinel-columns))

(t2/define-before-insert :model/TableRemapping
  [row]
  (coerce-sentinels-write row))

(t2/define-before-update :model/TableRemapping
  [row]
  (coerce-sentinels-write row))

(t2/define-before-select :model/TableRemapping
  [query]
  ;; Translate explicitly-passed nil → "" in lookup kv-args so app code can
  ;; pass nil for an absent slot the same way it does on writes. Don't add
  ;; missing keys — that would over-filter broad lookups.
  (update query :kv-args coerce-sentinels-match))

(t2/define-after-insert :model/TableRemapping
  [row]
  (cache/invalidate-config! {:databases [(:database_id row)]})
  row)

(t2/define-before-delete :model/TableRemapping
  [row]
  (cache/invalidate-config! {:databases [(:database_id row)]}))
