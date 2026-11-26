(ns metabase-enterprise.workspaces.models.table-remapping
  "Toucan 2 model for the `table_remapping` table.

   `from_db` / `from_schema` / `to_db` / `to_schema` use `\"\"` as a storage
   sentinel for an absent AST level — Postgres/MySQL/H2 treat NULL as
   not-equal-to-NULL in unique indexes, so the constraint
   `(database_id, from_db, from_schema, from_table_name, worktree_id)` needs non-null
   values. The model coerces nil (and, on writes, missing keys) to `\"\"` so
   app code can pass nil or omit the column. Reads return rows verbatim
   (`\"\"` shows up); callers wanting nil semantics translate locally.

   Inserts and deletes invalidate the QP cache for the affected database —
   Phase 2's SQL rewriter doesn't run on cache hits, so a stale canonical-
   identifier result post-remap would silently breach workspace isolation.
   They also drop this process's [[database-ids-with-remappings]] cache."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.cache.models.cache-config :as cache-config]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TableRemapping [_model] :table_remapping)

(doto :model/TableRemapping
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?)
  (derive :hook/worktree-id))

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

;; `:generation` counts invalidations, so a read that raced a write never caches what it read. `:read-at` is the
;; `System/nanoTime` of the read, so a cached value expires after [[database-ids-max-age-ns]].
(defonce ^:private database-ids-cache (atom {:generation 0, :database-ids nil, :read-at 0}))

(def ^:private database-ids-max-age-ns
  "How long a cached value is used. Bounds how long a node misses rows that another node inserted."
  (* 60 1000 1000 1000))

(defn invalidate-database-ids!
  "Drop this process's [[database-ids-with-remappings]] cache, so that the next call queries the app DB."
  []
  (swap! database-ids-cache (fn [{:keys [generation]}] {:generation (inc generation), :database-ids nil, :read-at 0})))

(defn database-ids-with-remappings
  "The set of Database ids that have a TableRemapping, as this process last read it. Queries the app DB on first use,
  inside an app-DB transaction, at most once a minute, and after this process commits an insert or a delete or sees
  the `workspaces-enabled` setting change. Other calls cost no query.

  Inside a transaction it queries and leaves the cache alone: that transaction may have written rows it later rolls
  back, and a rollback runs no hook to drop what it cached.

  A write on another node does not drop it, so it can miss that node's rows for up to a minute."
  []
  (let [{:keys [generation database-ids read-at]} @database-ids-cache]
    (cond
      (app-db/in-transaction?)
      (ws.db/table-remapping-database-ids)

      (and database-ids (< (- (System/nanoTime) (long read-at)) (long database-ids-max-age-ns)))
      database-ids

      :else
      (let [now (System/nanoTime)
            ids (ws.db/table-remapping-database-ids)]
        (swap! database-ids-cache #(cond-> %
                                     (= generation (:generation %)) (assoc :database-ids ids, :read-at now)))
        ids))))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- invalidate!
  "Invalidate the QP cache of the Databases with `database-ids`, once for all of them, and drop this process's
  [[database-ids-with-remappings]] cache after the commit, since another thread that read before the commit would
  otherwise cache the rows as they were before this write."
  [database-ids]
  (when (seq database-ids)
    (cache-config/invalidate! {:databases (vec database-ids)})
    (app-db/do-after-commit invalidate-database-ids!)))

(mu/defn upsert-table-remapping!
  "Make the TableRemapping of the Database with `database-id` from `from-spec` point at `to-spec`."
  [database-id :- ms/PositiveInt
   from-spec   :- ::ws.db/table-spec
   to-spec     :- ::ws.db/table-spec]
  (t2/with-transaction [_conn]
    (u/prog1 (ws.db/upsert-table-remapping! database-id from-spec to-spec)
      (invalidate! [database-id]))))

(mu/defn delete-table-remapping!
  "Delete the TableRemapping of the Database with `database-id` whose source is `from-spec`, returning the number of
  rows deleted."
  [database-id :- ms/PositiveInt
   from-spec   :- ::ws.db/table-spec]
  (t2/with-transaction [_conn]
    (u/prog1 (ws.db/delete-table-remapping! database-id from-spec)
      (when (pos? <>) (invalidate! [database-id])))))

(mu/defn delete-table-remappings-of-database!
  "Delete the TableRemappings of the Database with `database-id`, returning the number of rows deleted."
  [database-id :- ms/PositiveInt]
  (t2/with-transaction [_conn]
    (u/prog1 (ws.db/delete-table-remappings-of-database! database-id)
      (when (pos? <>) (invalidate! [database-id])))))

(mu/defn delete-table-remappings-of-databases!
  "Delete the TableRemappings of the Databases with `database-ids` in one statement, returning the number of rows
  deleted."
  [database-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/with-transaction [_conn]
    (u/prog1 (ws.db/delete-table-remappings-of-databases! database-ids)
      (when (pos? <>) (invalidate! database-ids)))))

(mu/defn delete-table-remappings-into!
  "Delete the TableRemappings of the Database with `database-id` whose target is in the `(to-db, to-schema)`
  namespace, returning the number of rows deleted."
  [database-id :- ms/PositiveInt
   to-db       :- :string
   to-schema   :- :string]
  (t2/with-transaction [_conn]
    (u/prog1 (ws.db/delete-table-remappings-into! database-id to-db to-schema)
      (when (pos? <>) (invalidate! [database-id])))))

(mu/defn delete-all-table-remappings!
  "Delete every TableRemapping."
  []
  (t2/with-transaction [_conn]
    (let [database-ids (ws.db/table-remapping-database-ids)]
      (u/prog1 (ws.db/delete-all-table-remappings!)
        (invalidate! database-ids)))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/TableRemapping [_model]
  {:skip? false})
