(ns metabase.sync.metadata-sync.stats
  "The stats of the Tables that one instance sends another: the values of a Table that follow the warehouse's data
  and not its structure. They are its estimated row count, and the cached field values of its Fields. The labels of
  internal display remaps are not sent: display remaps are not.

  Field values are rows of the customer's tables, so nothing here logs them."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::field-values
  [:map
   [:field           [:sequential {:min 1} :string]]
   [:values          ms/FieldValues]
   [:has_more_values :boolean]])

(mr/def ::entry
  [:map
   [:estimated_row_count {:optional true} :int]
   [:field_values        [:sequential ::field-values]]])

(defn- latest-by-field
  "The newest of `rows` for each Field, by Table id: a Field can have several rows of one type."
  [rows]
  (update-vals (group-by :table_id rows)
               (fn [table-rows]
                 (->> (group-by :field_name table-rows)
                      vals
                      (map #(last (sort-by (juxt :updated_at :id) %)))
                      (sort-by :field_name)))))

(defn- field-values-entry
  "The entry of one FieldValues row: its Field's path, its values, and whether the Field has more values than these."
  [{:keys [field_name values has_more_values]}]
  {:field           [field_name]
   :values          (vec values)
   :has_more_values (boolean has_more_values)})

(mu/defn table-stats :- [:map-of ::lib.schema.id/table ::entry]
  "The stats entry of each of `tables`, which are rows from
  [[metabase.sync.metadata-sync.tables/selection]], by Table id. A Table with no row count and no field
  values has no entry."
  [tables :- [:sequential ::sync.db/described-table]]
  (let [field-values (latest-by-field (pages/in-batches sync.db/full-field-values-of-tables (mapv :id tables)))]
    (into {}
          (keep (fn [{table-id :id row-count :estimated_row_count}]
                  (let [values (mapv field-values-entry (field-values table-id))]
                    (when (or row-count (seq values))
                      [table-id (cond-> {:field_values values}
                                  row-count (assoc :estimated_row_count row-count))]))))
          tables)))

(defn stats-size
  "The size of the stats `entry` in bytes, as JSON."
  [entry]
  (count (.getBytes ^String (json/encode entry) "UTF-8")))
