(ns metabase.indexes.reconcile
  "Reconcile Metabase-managed index hints (TableIndex rows) with the indexes physically present in the warehouse.
  Shared by the read API and the transform-run status verification."
  (:require
   [metabase.driver :as driver]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def unnamed-inline-kinds
  "Index kinds with no physical name (warehouse `:name` is nil); matched by kind + key columns instead."
  #{:sortkey :order-by :distkey})

(defn normalize-managed
  "A managed `TableIndex` row as a unified merged entry: the structured definition mapped into the canonical
  physical shape, plus the lifecycle fields and `:metabase_managed true`. Physical fields we can't know from a
  request default to nil/false/true-valid."
  [{:keys [index_name structured] :as row}]
  (merge
   (select-keys row [:id :transform_id :status :error_message :created_by
                     :created_at :updated_at :last_executed_at])
   {:name              index_name
    :kind              (:kind structured)
    :access-method     nil
    :is-unique         (boolean (:unique structured))
    :is-primary        false
    :is-valid          true
    :key-columns       (mapv :name (:columns structured))
    :include-columns   (vec (:include structured))
    :partial-predicate nil
    :definition        nil
    :structured        structured
    :metabase_managed  true}))

(defn match-key
  "Join key for an entry: `[:kind key-columns]` for unnamed-inline kinds, else the physical `:name`."
  [{:keys [kind name key-columns]}]
  (if (contains? unnamed-inline-kinds kind)
    [kind key-columns]
    name))

(defn- merge-physical
  "A managed entry with a matching warehouse map's physical fields layered on (warehouse is ground truth, but a
  nil warehouse value keeps the managed value, e.g. an inline key's name)."
  [managed warehouse]
  (reduce-kv (fn [m k v] (if (some? v) (assoc m k v) m))
             managed
             (select-keys warehouse [:name :kind :access-method :is-unique :is-primary :is-valid
                                     :key-columns :include-columns :partial-predicate :definition])))

(defn merge-indexes
  "Outer-join `managed-rows` (TableIndex maps) and `warehouse-maps` (from `driver/fetch-table-indexes`) on
  [[match-key]], deduped. Each entry carries `:metabase_managed` and `:present_in_warehouse`."
  [managed-rows warehouse-maps]
  (let [managed     (mapv normalize-managed managed-rows)
        wh-by-key   (group-by match-key warehouse-maps)
        managed*    (mapv (fn [m]
                            (if-let [wh (first (get wh-by-key (match-key m)))]
                              (assoc (merge-physical m wh) :present_in_warehouse true)
                              (assoc m :present_in_warehouse false)))
                          managed)
        managed-key (into #{} (map match-key) managed)
        unmanaged   (->> warehouse-maps
                         (remove #(contains? managed-key (match-key %)))
                         (mapv #(assoc % :metabase_managed false :present_in_warehouse true)))]
    (into managed* unmanaged)))

(defn fetch-warehouse-indexes
  "Physical indexes on `table-name` (`schema`) in `database` via `driver/fetch-table-indexes`. Returns `[]` if the
  driver can't introspect indexes or the warehouse is unreachable, so callers degrade instead of erroring."
  [database schema table-name]
  (try
    (vec (driver/fetch-table-indexes (:engine database) database schema table-name))
    (catch Throwable t
      (log/warnf t "fetch-table-indexes failed for %s.%s" schema table-name)
      [])))
