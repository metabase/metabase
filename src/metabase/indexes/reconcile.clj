(ns metabase.indexes.reconcile
  "Reconcile Metabase-managed index hints (TableIndex rows) with the indexes physically present in the warehouse.
  Shared by the read API and the transform-run status verification: we create a managed index, then match it against
  `driver/fetch-table-indexes` to confirm it landed."
  (:require
   [metabase.driver :as driver]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def unnamed-inline-kinds
  "Index kinds with no physical name (warehouse `:name` is nil); matched by kind + key columns instead."
  #{:sortkey :order-by :distkey})

(defn match-key
  "Join key for a warehouse index map: `[:kind key-columns]` for unnamed-inline kinds, else its `:name`."
  [{:keys [kind key-columns] index-name :name}]
  (if (contains? unnamed-inline-kinds kind)
    [kind key-columns]
    index-name))

(defn managed-match-key
  "The [[match-key]] for a managed TableIndex row, from its stored structured definition and index name."
  [{:keys [index_name structured]}]
  (match-key {:kind        (:kind structured)
              :name        index_name
              :key-columns (mapv :name (:columns structured))}))

(defn warehouse->structured
  "The `::schema/index-structured` for an unmanaged warehouse index. Deterministic: a sortkey's style and a
  skip-index's type ride on `:access-method`; an expression key column carries its text as the column name."
  [{:keys [kind key-columns include-columns access-method is-unique] index-name :name}]
  (cond-> {:kind kind :columns (mapv (fn [c] {:name c}) key-columns)}
    index-name            (assoc :name index-name)
    (= kind :sortkey)     (assoc :style (keyword access-method))
    (= kind :skip-index)  (assoc :type (keyword access-method))
    (seq include-columns) (assoc :include (vec include-columns))
    is-unique             (assoc :unique true)))

(defn- managed-entry
  "A managed TableIndex row as a merged-list entry: its stored definition plus lifecycle, flagged managed."
  [row]
  (-> (select-keys row [:id :transform_id :structured :status :error_message
                        :created_by :created_at :updated_at :last_executed_at])
      (assoc :metabase_managed true)))

(defn merge-indexes
  "Managed TableIndex `rows` for `transform-id` merged with the indexes physically present in the warehouse, as one
  list of `::schema/index-structured`-shaped entries. A managed entry renders from its stored `:structured`; an
  unmanaged (DBA) index is converted from its observation and flagged `:metabase_managed false`. A managed index that
  also exists in the warehouse is matched, so it's listed once -- as the managed entry."
  [transform-id rows warehouse-maps]
  (let [managed-keys (into #{} (map managed-match-key) rows)]
    (into (mapv managed-entry rows)
          (comp (remove #(contains? managed-keys (match-key %)))
                (map (fn [wh] {:metabase_managed false
                               :transform_id     transform-id
                               :structured       (warehouse->structured wh)
                               :status           :succeeded})))
          warehouse-maps)))

(defn fetch-warehouse-indexes
  "Physical indexes on `table-name` (`schema`) in `database` via `driver/fetch-table-indexes`. Returns `[]` if the
  driver can't introspect indexes or the warehouse is unreachable, so callers degrade instead of erroring."
  [database schema table-name]
  (try
    (vec (driver/fetch-table-indexes (:engine database) database schema table-name))
    (catch Throwable t
      (log/warnf t "fetch-table-indexes failed for %s.%s" schema table-name)
      [])))
