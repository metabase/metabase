(ns metabase.warehouse-schema.metadata-queries
  "Functions for constructing queries that can be used to get metadata about an attached data warehouse. TODO -- do
  these belong here? Or in `warehouses`? Or in `sync`?"
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn- partition-field->filter-form :- :mbql.clause/>
  "Given a partition field, returns the default value can be used to query."
  [field :- ::lib.schema.metadata/column]
  (condp #(isa? %2 %1) (:base-type field)
    :type/Number   (lib/> field -9223372036854775808)
    :type/Date     (lib/> field "0001-01-01")
    :type/DateTime (lib/> field "0001-01-01T00:00:00")))

(mu/defn add-required-filters-if-needed :- ::lib.schema/query
  "Add a dummy filter for tables that require filters.
  Look into tables from source tables and all the joins.
  Currently this only apply to partitioned tables on bigquery that requires a partition filter.
  In the future we probably want this to be dispatched by database engine or handled by QP."
  [query :- ::lib.schema/query]
  (transduce
   (comp (map (fn [table-id]
                (lib.metadata/table query table-id)))
         (filter :active)
         (filter :database-require-filter)
         (mapcat (fn [{table-id :id, :as _table}]
                   (lib.metadata/active-fields query table-id)))
         (filter :database-partitioned)
         ;; resolve the Field ID to correct visible metadata, e.g. if this column
         ;; comes from a join or something we need to make sure we have metadata
         ;; with a join alias.
         ;;
         ;; don't fetch visible columns unless we actually need to
         (keep (let [visible-columns (delay (lib/visible-columns query))]
                 (fn [field]
                   (m/find-first #(= (:id %) (:id field))
                                 @visible-columns))))
         (map partition-field->filter-form))
   (completing lib/filter)
   query
   (lib/all-source-table-ids query)))

(mu/defn human-readable-remapping-map :- [:maybe ::parameters.schema/human-readable-remapping-map]
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
