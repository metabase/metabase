(ns metabase.driver.common.table-rows-sample
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   ;; TODO -- for historical reasons this stuff uses the Toucan models instead of the QP Metadata Store and
   ;; `:metadata/*` models -- at some point we should fix this. [[driver/table-rows-sample]] is called by sync however
   ;; so we need to go in and update the sync code as well.
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.metadata-queries :as schema.metadata-queries]))

(def max-sample-rows
  "The maximum number of values we should return when using `table-rows-sample`. This many is probably fine for
  inferring semantic types and what-not; we don't want to scan millions of values at any rate."
  10000)

(def nested-field-sample-limit
  "Number of rows to sample for tables with nested (e.g., JSON) columns."
  500)

(mr/def ::table-rows-sample.options
  "Schema for `table-rows-sample` options"
  [:maybe
   [:map
    [:truncation-size {:optional true} :int]
    [:limit           {:optional true} :int]
    [:order-by        {:optional true} [:maybe [:sequential :some]]] ; something that can be passed to [[metabase.lib.core/order-by]]
    [:rff             {:optional true} fn?]]])

(mu/defn- table-rows-sample-query :- ::lib.schema/query
  "Returns the mbql query to query a table for sample rows"
  [mp    :- ::lib.schema.metadata/metadata-provider
   table :- ::lib.schema.metadata/table
   cols  :- [:maybe [:sequential ::lib.schema.metadata/column]]
   {:keys [truncation-size limit order-by] :or {limit max-sample-rows} :as _opts} :- ::table-rows-sample.options]
  (let [database             (lib.metadata/database mp)
        driver               (driver.u/database->driver database)
        col->expression-name (if (and truncation-size (driver.u/supports? driver :expressions database))
                               (into {}
                                     (comp (filter (fn [field]
                                                     ;; only do this for columns that are `:type/Text`, not for anything derived from
                                                     ;; `:type/Text`
                                                     (= ((some-fn :effective-type :base-type) field) :type/Text)))
                                           (map (juxt identity (fn [_field]
                                                                 (str (gensym "substring"))))))
                                     cols)
                               {})]
    (-> (lib/query mp table)
        (as-> $query (transduce
                      (filter col->expression-name)
                      (completing
                       (fn [query col]
                         (let [expression-name (get col->expression-name col)
                               expression      (lib/substring col 1 truncation-size)]
                           (lib/expression query expression-name expression))))
                      $query
                      cols))
        (as-> $query (lib/with-fields $query (for [col cols]
                                               (if-let [expression-name (get col->expression-name col)]
                                                 (lib/expression-ref $query expression-name)
                                                 col))))
        (lib/limit limit)
        (cond-> (seq order-by)
          (as-> $query (reduce lib/order-by $query order-by)))
        (assoc :middleware {:format-rows?           false
                            :skip-results-metadata? true})
        schema.metadata-queries/add-required-filters-if-needed)))

;;; TODO (Cam 9/30/25) -- at some point we should update this stuff to use Lib-style metadata instead of Toucan
;;; instances

(mu/defn table-rows-sample
  "Run a basic MBQL query to fetch a sample of rows of `fields` belonging to a `table`.

  Options: a map of
  `:truncation-size`: [optional] size to truncate text fields if the driver supports expressions.
  `:rff`: [optional] a reducing function function (a function that given initial results metadata returns a reducing
  function) to reduce over the result set in the the query-processor rather than realizing the whole collection"
  ([table  :- (ms/InstanceOf :model/Table)
    fields :- [:sequential (ms/InstanceOf :model/Field)]
    rff]
   (table-rows-sample table fields rff nil))

  ([table  :- [:and
               (ms/InstanceOf :model/Table)
               [:map
                [:id    ::lib.schema.id/table]
                [:db_id ::lib.schema.id/database]]]
    fields :- [:sequential (ms/InstanceOf :model/Field)]
    rff    :- ::qp.schema/rff
    opts   :- ::table-rows-sample.options]
   (let [database-id (:db_id table)
         mp          (lib-be/application-database-metadata-provider database-id)
         table       (lib-be/instance->metadata table :metadata/table)
         fields      (map #(lib-be/instance->metadata % :metadata/column) fields)
         query       (table-rows-sample-query mp table fields opts)]
     (qp/process-query query rff))))

(defmethod driver/table-rows-sample :default
  [_driver table fields rff opts]
  (table-rows-sample table fields rff opts))
