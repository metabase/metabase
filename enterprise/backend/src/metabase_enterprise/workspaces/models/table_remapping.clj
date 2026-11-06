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
   identifier result post-remap would silently breach workspace isolation.
   They also drop this process's [[database-ids-with-remappings]] cache."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.app-db.core :as app-db]
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

;; `:generation` counts invalidations, so a read that raced a write never caches what it read.
(defonce ^:private database-ids-cache (atom {:generation 0, :database-ids nil}))

(defn- invalidate-database-ids! []
  (swap! database-ids-cache (fn [{:keys [generation]}] {:generation (inc generation), :database-ids nil})))

(defn database-ids-with-remappings
  "The set of Database ids that have a TableRemapping, as this process last read it. Reads the app DB on first use
  and after every insert or delete this process makes; every other call costs no query.

  A write on another node does not invalidate it, so it is only safe where no other node can insert rows: outside
  workspace mode, where nothing in production inserts them."
  []
  (let [{:keys [generation database-ids]} @database-ids-cache]
    (or database-ids
        (let [ids (ws.db/table-remapping-database-ids)]
          (swap! database-ids-cache #(cond-> % (= generation (:generation %)) (assoc :database-ids ids)))
          ids))))

(defn- invalidate! [row]
  (cache/invalidate-config! {:databases [(:database_id row)]})
  ;; Now, so this transaction's own reads see its write; again after commit, so a read by another thread that
  ;; ran before the commit doesn't stay cached.
  (invalidate-database-ids!)
  (app-db/do-after-commit invalidate-database-ids!))

(t2/define-after-insert  :model/TableRemapping [row] (invalidate! row) row)
(t2/define-before-delete :model/TableRemapping [row] (invalidate! row))
