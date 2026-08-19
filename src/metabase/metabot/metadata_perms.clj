(ns metabase.metabot.metadata-perms
  (:require
   [metabase.api.common :as api]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
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
