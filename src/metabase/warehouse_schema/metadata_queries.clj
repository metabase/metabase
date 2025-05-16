(ns metabase.warehouse-schema.metadata-queries
  "Functions for constructing queries that can be used to get metadata about an attached data warehouse. TODO -- do
  these belong here? Or in `warehouses`? Or in `sync`?"
  (:require
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- partition-field->filter-form
  "Given a partition field, returns the default value can be used to query."
  [field]
  (let [field-form [:field (:id field) {:base-type (:base_type field)}]]
    (condp #(isa? %2 %1) (:base_type field)
      :type/Number   [:> field-form -9223372036854775808]
      :type/Date     [:> field-form "0001-01-01"]
      :type/DateTime [:> field-form "0001-01-01T00:00:00"])))

(defn add-required-filters-if-needed
  "Add a dummy filter for tables that require filters.
  Look into tables from source tables and all the joins.
  Currently this only apply to partitioned tables on bigquery that requires a partition filter.
  In the future we probably want this to be dispatched by database engine or handled by QP."
  [query]
  (let [table-ids              (->> (conj (keep :source-table (:joins query)) (:source-table query))
                                    (filter pos-int?))
        required-filter-fields (when (seq table-ids)
                                 (t2/select :model/Field {:select    [:f.*]
                                                          :from      [[:metabase_field :f]]
                                                          :left-join [[:metabase_table :t] [:= :t.id :f.table_id]]
                                                          :where     [:and
                                                                      [:= :f.active true]
                                                                      [:= :f.database_partitioned true]
                                                                      [:= :t.active true]
                                                                      [:= :t.database_require_filter true]
                                                                      [:in :t.id table-ids]]}))
        update-query-filter-fn (fn [existing-filter new-filter]
                                 (if (some? existing-filter)
                                   [:and existing-filter new-filter]
                                   new-filter))]
    (case (count required-filter-fields)
      0
      query
      1
      (update query :filter update-query-filter-fn (partition-field->filter-form (first required-filter-fields)))
      ;; > 1
      (update query :filter update-query-filter-fn (into [:and] (map partition-field->filter-form required-filter-fields))))))

(mu/defn human-readable-remapping-map :- [:maybe :parameters/human-readable-remapping-map]
  "Get the human readable (internally mapped) values of the field specified by `field-id`."
  [field-id :- pos-int?]
  (let [{orig :values, remapped :human_readable_values}
        (t2/select-one [:model/FieldValues :values :human_readable_values]
                       {:where [:and
                                [:= :type "full"]
                                [:= :field_id field-id]
                                [:not= :human_readable_values nil]
                                [:not= :human_readable_values "{}"]]})]
    (some->> (seq remapped) (zipmap orig))))
