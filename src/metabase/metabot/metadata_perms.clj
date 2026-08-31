(ns metabase.metabot.metadata-perms
  (:require
   [metabase.api.common :as api]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *cache*
  "Cache atom bound by [[with-cache]], or nil to read through to the app DB on every call."
  nil)

(defmacro with-cache
  "Memoize this namespace's lookups for the duration of `body`. Nesting reuses the enclosing cache."
  {:style/indent 0}
  [& body]
  `(binding [*cache* (or *cache* (atom {}))]
     ~@body))

(defn- memoized
  [k ids compute absent]
  (let [ids     (set ids)
        cache   *cache*
        k       [api/*current-user-id* api/*is-superuser?* k]
        known   (if cache (get @cache k {}) {})
        missing (into #{} (remove #(contains? known %)) ids)
        fresh   (when (seq missing)
                  (let [computed (compute missing)]
                    (into {} (map (fn [id] [id (get computed id absent)])) missing)))]
    (when (and cache (seq fresh))
      (swap! cache update k merge fresh))
    (select-keys (merge known fresh) ids)))

(defn- table-rows
  [table-ids]
  (memoized :table-row table-ids
            (fn [ids] (t2/select-fn->fn :id identity :model/Table :id [:in ids]))
            nil))

(defn- permitted-table-ids
  [k pred table-ids]
  (->> (memoized k table-ids
                 (fn [ids]
                   (let [tables (into [] (keep (table-rows ids)) ids)]
                     (perms/prime-table-perms-cache {:table-ids (into #{} (map :id) tables)})
                     (into {} (comp (filter pred) (map (juxt :id (constantly true)))) tables)))
                 false)
       (into #{} (keep (fn [[id permitted?]] (when permitted? id))))))

(defn queryable-table-ids
  "Returns the subset of `table-ids` the current user may run queries against."
  [table-ids]
  (permitted-table-ids :queryable-table mi/can-query? table-ids))

(defn- data-accessible?
  [table]
  (perms/user-has-permission-for-table? api/*current-user-id*
                                        :perms/view-data :unrestricted
                                        (:db_id table) (:id table)))

(defn data-accessible-table-ids
  "Returns the subset of `table-ids` the current user has unrestricted view-data access to."
  [table-ids]
  (permitted-table-ids :data-accessible-table data-accessible? table-ids))

(defn- row-restricted-by-db
  "`{table-id restricted?}` for one database's `tables`, computed from a single
  [[perms/data-access-token]] call. Impersonation and routing are per-database, not per-table, so
  batching by database avoids recomputing them once per table. Fails closed on error."
  [db-id tables]
  (let [ids (into #{} (map :id) tables)
        restrict-all (into {} (map (fn [id] [id true])) ids)]
    (try
      (let [token (perms/data-access-token {:database-id db-id :table-ids ids})
            db-wide-restricted? (boolean (or (:impersonation token) (:routing token)))]
        (into {} (map (fn [id] [id (or db-wide-restricted? (contains? (:sandbox token) id))])) ids))
      (catch Exception e
        (log/debugf e "Restriction probe failed for database %d, falling back per table" db-id)
        ;; Impersonation and routing are the realistic throw sources (a missing user attribute),
        ;; and both are database-wide -- a single cheap probe with `:table-ids #{}` (which skips
        ;; the per-table sandbox lookup entirely) tells us whether that's the case, without turning
        ;; every failure into an O(table count) retry.
        (try
          (let [{:keys [impersonation routing]} (perms/data-access-token {:database-id db-id :table-ids #{}})]
            (if (or impersonation routing)
              restrict-all
              ;; The probe succeeded with no impersonation/routing, so the original failure must be
              ;; an isolated per-table sandbox problem -- retry per table so one broken table
              ;; doesn't drag its unrelated siblings down with it.
              (into {}
                    (map (fn [id]
                           [id (try
                                 (boolean (seq (perms/data-access-token {:database-id db-id :table-ids #{id}})))
                                 (catch Exception e
                                   (log/debugf e "Restriction probe failed for table %d, defaulting to restricted" id)
                                   true))]))
                    ids)))
          (catch Exception e
            (log/debugf e "Restriction probe failed for database %d, defaulting to restricted" db-id)
            restrict-all))))))

(defn row-restricted-table-ids
  "Returns the subset of `table-ids` whose current user's row access is narrowed by sandboxing,
  connection impersonation, or database routing. Fails closed: a table whose restriction lens
  can't be resolved (an attribute needed to compute it is missing) is included."
  [table-ids]
  (->> (memoized :row-restricted-table table-ids
                 (fn [ids]
                   (let [tables (into [] (keep (table-rows ids)) ids)]
                     (into {} (mapcat (fn [[db-id db-tables]] (row-restricted-by-db db-id db-tables)))
                           (group-by :db_id tables))))
                 true)
       (into #{} (keep (fn [[id restricted?]] (when restricted? id))))))

(defn sandbox-restricted-fields
  "Returns `{table-id #{allowed-field-id}}` for the column-sandboxed subset of `table-ids`."
  [table-ids]
  (->> (memoized :sandbox-fields table-ids
                 #(metrics/sandbox-restricted-fields (set %))
                 ::unrestricted)
       (into {} (remove #(= ::unrestricted (val %))))))

(defn field-id->table-id
  "Returns a `{field-id table-id}` map for the given `field-ids`."
  [field-ids]
  (->> (memoized :field-table field-ids
                 (fn [ids] (t2/select-fn->fn :id :table_id [:model/Field :id :table_id] :id [:in ids]))
                 nil)
       (into {} (remove #(nil? (val %))))))
