(ns metabase.driver.common.table-rows-sample
  #_{:clj-kondo/ignore [:metabase/modules]}
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.schema.helpers :as helpers]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   ;; TODO -- for historical reasons this stuff uses the Toucan models instead of the QP Metadata Store and
   ;; `:metadata/*` models -- at some point we should fix this. [[driver/table-rows-sample]] is called by sync however
   ;; so we need to go in and update the sync code as well.
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.metadata-queries :as schema.metadata-queries]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(def max-sample-rows
  "The maximum number of values we should return when using `table-rows-sample`. This many is probably fine for
  inferring semantic types and what-not; we don't want to scan millions of values at any rate."
  10000)

(def nested-field-sample-limit
  "Number of rows to sample for tables with nested (e.g., JSON) columns."
  500)

(def ^:private TableRowsSampleOptions
  "Schema for `table-rows-sample` options"
  [:maybe
   [:map
    [:truncation-size {:optional true} :int]
    [:limit           {:optional true} :int]
    [:order-by        {:optional true} (helpers/distinct (helpers/non-empty [:sequential ::mbql.s/OrderBy]))]
    [:rff             {:optional true} fn?]]])

(defn- table-rows-sample-query
  "Returns the mbql query to query a table for sample rows"
  [table
   fields
   {:keys [truncation-size limit order-by] :or {limit max-sample-rows} :as _opts}]
  (let [database           (t2/select-one :model/Database (:db_id table))
        driver             (driver.u/database->driver database)
        text-fields        (filter (comp #{:type/Text} (some-fn :effective_type :base_type)) fields)
        field->expressions (when (and truncation-size (driver.u/supports? driver :expressions database))
                             (into {} (for [field text-fields]
                                        [field [(str (gensym "substring"))
                                                [:substring [:field (u/the-id field) nil]
                                                 1 truncation-size]]])))
        expressions        (into {} (vals field->expressions))]
    {:database   (:db_id table)
     :type       :query
     :query      (cond-> {:source-table (u/the-id table)
                          :expressions  expressions
                          :fields       (vec (for [field fields]
                                               (if-let [[expression-name _] (get field->expressions field)]
                                                 [:expression expression-name]
                                                 [:field (u/the-id field) nil])))
                          :limit        limit}
                   order-by
                   (assoc :order-by order-by)

                   true
                   schema.metadata-queries/add-required-filters-if-needed)
     :middleware {:format-rows?           false
                  :skip-results-metadata? true}}))

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

  ([table  :- (ms/InstanceOf :model/Table)
    fields :- [:sequential (ms/InstanceOf :model/Field)]
    rff    :- fn?
    opts   :- TableRowsSampleOptions]
   (let [query (table-rows-sample-query table fields opts)]
     (qp/process-query query rff))))

(defmethod driver/table-rows-sample :default
  [_driver table fields rff opts]
  (table-rows-sample table fields rff opts))
