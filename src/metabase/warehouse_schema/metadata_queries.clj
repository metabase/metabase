(ns metabase.warehouse-schema.metadata-queries
  "Functions for constructing queries that can be used to get metadata about an attached data warehouse. TODO -- do
  these belong here? Or in `warehouses`? Or in `sync`?"
  (:require
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
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

(mu/defn add-required-filters-if-needed-mbql5 :- ::lib.schema/query
  "Add a dummy filter for tables that require filters.
  Look into tables from source tables and all the joins.
  Currently this only apply to partitioned tables on bigquery that requires a partition filter.
  In the future we probably want this to be dispatched by database engine or handled by QP."
  [query :- ::lib.schema/query]
  (let [table-ids              (lib/all-source-table-ids query)
        ;; TODO -- consider whether we can use the Metadata providers to power this -- we'd probably need to extend
        ;; `:metabase.warehouse-schema.metadata-queries/metadata-spec` a bit
        required-filter-fields (when (seq table-ids)
                                 (t2/select :metadata/column {:where [:and
                                                                      [:= :field/active true]
                                                                      [:= :field/database_partitioned true]
                                                                      [:= :table/active true]
                                                                      [:= :table/database_require_filter true]
                                                                      [:in :table/id table-ids]]}))]
    (transduce
     (map partition-field->filter-form)
     (completing lib/filter)
     query
     required-filter-fields)))

(mu/defn add-required-filters-if-needed :- ::mbql.s/Query
  "DEPRECATED: Use [[add-required-filters-if-needed-mbql-5]] going forward."
  {:deprecated "0.57.0"}
  [query :- ::mbql.s/Query]
  (->> query
       (lib/query (lib-be/application-database-metadata-provider (:database query)))
       add-required-filters-if-needed-mbql5
       #_{:clj-kondo/ignore [:discouraged-var]}
       lib/->legacy-MBQL))

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
