(ns metabase.warehouse-schema.metadata-from-qp
  "Get metadata by running queries with the query processor."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.metadata-queries :as schema.metadata-queries]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(def ^:private FieldOrColumn
  "A Field, as an app DB row or as Lib metadata."
  [:multi {:dispatch (fn [x] (if (:lib/type x) :lib-metadata :row))}
   [:lib-metadata ::lib.schema.metadata/column]
   [:row          ::warehouse-schema.schema/field]])

(mu/defn table-query
  "Runs the `mbql-query` where the source table is `table-id` and returns the result.
  Add the required filters if the table requires it,
  see [[metabase.warehouse-schema.metadata-queries/add-required-filters-if-needed]] for more details. Also takes an
  optional `rff`, use the default rff if not provided."
  ([table-id    :- ::lib.schema.id/table
    query-xform :- [:=> [:cat ::lib.schema/query] ::lib.schema/query]]
   (table-query table-id query-xform nil))

  ([table-id    :- ::lib.schema.id/table
    query-xform :- [:=> [:cat ::lib.schema/query] ::lib.schema/query]
    rff         :- [:maybe ::qp.schema/rff]]
   {:pre [(pos-int? table-id)]}
   (let [database-id (warehouse-schema.db/table-database-id table-id)
         mp          (lib-be/application-database-metadata-provider database-id)
         query       (-> (lib/query mp (lib.metadata/table mp table-id))
                         query-xform
                         (assoc-in [:middleware :disable-remaps?] true)
                         schema.metadata-queries/add-required-filters-if-needed)]
     (binding [qp.i/*disable-qp-logging* true]
       (qp/process-query query rff)))))

(mu/defn field-distinct-count
  "Return the distinct count of `field`."
  ([field :- FieldOrColumn]
   (field-distinct-count field nil))

  ([field :- FieldOrColumn
    limit :- [:maybe pos-int?]]
   (let [field (cond-> field
                 (t2/model field) (lib-be/instance->metadata :metadata/column))]
     (-> (table-query (:table-id field)
                      (fn [query]
                        (-> query
                            (lib/aggregate (lib/distinct field))
                            (cond-> limit
                              (lib/limit limit)))))
         :data :rows first first int))))

(mu/defn field-count
  "Return the count of `field`."
  [field :- FieldOrColumn]
  (let [field (cond-> field
                (t2/model field) (lib-be/instance->metadata :metadata/column))]
    (-> (table-query (:table-id field) #(lib/aggregate % (lib/count field)))
        :data :rows first first int)))
