(ns metabase-enterprise.workspaces.models.table-remapping
  "Toucan 2 model for the `table_remapping` table.

   `from_db` / `from_schema` / `to_db` / `to_schema` use `\"\"` as a storage
   sentinel for an absent AST level — Postgres/MySQL/H2 treat NULL as
   not-equal-to-NULL in unique indexes, so the constraint
   `(database_id, from_db, from_schema, from_table_name)` needs non-null
   values. The model coerces nil (and, on writes, missing keys) to `\"\"` so
   app code can pass nil or omit the column. Reads return rows verbatim
   (`\"\"` shows up); callers wanting nil semantics translate locally.

   Inserts and deletes invalidate the QP cache for the affected database —
   Phase 2's SQL rewriter doesn't run on cache hits, so a stale canonical-
   identifier result post-remap would silently breach workspace isolation."
  (:require
   [metabase.cache.core :as cache]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TableRemapping [_model] :table_remapping)

(doto :model/TableRemapping
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(def ^:private sentinel-columns
  "Columns that use `\"\"` as the empty-slot sentinel in storage."
  #{:from_db :from_schema :to_db :to_schema})

(defn- coerce-sentinels
  "Replace nil with `\"\"` on every sentinel column present in `m`. When `fill?`,
   also fill in missing sentinel columns with `\"\"` (used on writes — the unique
   constraint requires non-null values; absent ≠ valid). On selects we leave
   absent columns alone so broad lookups like `:database_id 7` don't gain
   spurious `from_db = \"\"` predicates."
  [fill? m]
  (reduce (fn [acc k]
            (cond
              (and (contains? acc k) (nil? (get acc k))) (assoc acc k "")
              (and fill? (not (contains? acc k)))        (assoc acc k "")
              :else                                       acc))
          m
          sentinel-columns))

(t2/define-before-insert :model/TableRemapping [row]    (coerce-sentinels true  row))
(t2/define-before-update :model/TableRemapping [row]    (coerce-sentinels true  row))
(t2/define-before-select :model/TableRemapping [query]  (update query :kv-args #(coerce-sentinels false %)))

(defn- invalidate! [row] (cache/invalidate-config! {:databases [(:database_id row)]}))

(t2/define-after-insert  :model/TableRemapping [row] (invalidate! row) row)
(t2/define-before-delete :model/TableRemapping [row] (invalidate! row))
