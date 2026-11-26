(ns metabase.driver.common.table-rows-sample
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf]
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
   [:map {:closed true}
    [:truncation-size {:optional true} :int]
    [:limit           {:optional true} :int]
    [:order-by        {:optional true} [:maybe [:sequential [:or ::lib.schema.order-by/order-by ::lib.ref/referenceable]]]]
    [:table-sample    {:optional true} [:ref ::lib.schema/stage.table-sample]]
    [:rff             {:optional true} fn?]]])

(def ^:private block-sample-limit-factor
  "The limit of a block sample, as a multiple of the sample size. A block sample gives its rows in storage order, so a
  limit that it reaches cuts off the end of the table, which is often the newest rows. With this factor the limit is
  a cap for an old row count estimate, and a sample of the expected size does not reach it."
  2)

(mu/defn block-sample-percent :- [:maybe [:double {:min 0 :max 100}]]
  "The percent of a table that a block sample reads to give about `rows` rows, from the row count estimate
  `row-count`. Nil when there is no estimate."
  [{:keys [rows row-count]} :- [:map [:rows pos-int?] [:row-count {:optional true} [:maybe :int]]]]
  (when (some-> row-count pos?)
    (min 100.0 (/ (* 100.0 rows) row-count))))

(mu/defn- table-rows-sample-query :- ::lib.schema/query
  "Returns the mbql query to query a table for sample rows"
  [mp    :- ::lib.schema.metadata/metadata-provider
   table :- ::lib.schema.metadata/table
   cols  :- [:maybe [:sequential ::lib.schema.metadata/column]]
   {:keys [truncation-size limit order-by table-sample] :or {limit max-sample-rows} :as _opts} :- ::table-rows-sample.options]
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
        (cond-> table-sample
          (assoc-in [:stages 0 :table-sample] table-sample))
        (assoc :middleware {:format-rows?           false
                            :skip-results-metadata? true})
        (assoc-in [:info :context] :table-rows-sample)
        schema.metadata-queries/add-required-filters-if-needed)))

;;; TODO (Cam 9/30/25) -- at some point we should update this stuff to use Lib-style metadata instead of Toucan
;;; instances

(mu/defn table-rows-sample
  "Run a basic MBQL query to fetch a sample of rows of `fields` belonging to a `table`.

  Options: a map of
  `:truncation-size`: [optional] size to truncate text fields if the driver supports expressions.
  `:table-sample`: [optional] `{:percent p}` or `{:rows n}`, to read the table with the driver's built-in sample of
  about `p` percent of it or about `n` random rows. Only for a driver whose compiler reads it; see
  `:metabase.lib.schema/stage.table-sample`.
  `:rff`: [optional] a reducing function function (a function that given initial results metadata returns a reducing
  function) to reduce over the result set in the the query-processor rather than realizing the whole collection"
  ([table  :- :metabase.warehouse-schema.schema/table
    fields :- [:sequential :metabase.warehouse-schema.schema/field]
    rff    :- ::qp.schema/rff]
   (table-rows-sample table fields rff nil))

  ([table  :- :metabase.warehouse-schema.schema/table
    fields :- [:sequential :metabase.warehouse-schema.schema/field]
    rff    :- ::qp.schema/rff
    opts   :- ::table-rows-sample.options]
   (let [database-id (:db_id table)
         mp          (lib-be/application-database-metadata-provider database-id)
         table       (lib-be/instance->metadata table :metadata/table)
         fields      (map #(lib-be/instance->metadata % :metadata/column) fields)
         query       (table-rows-sample-query mp table fields opts)]
     (qp/process-query query rff))))

(defn block-sample
  "The [[metabase.driver/table-random-sample]] of a driver with a built-in block sample, that is, its own
  [[metabase.driver.sql.query-processor/table-sample->honeysql]]: about `(:rows opts)` rows from about
  [[block-sample-percent]] of the table. Declines, so that sync reads the first rows, when the table has no row count
  estimate."
  [table fields rff {:keys [rows] :as opts}]
  (if-let [percent (block-sample-percent opts)]
    {:method   :block
     :fraction (/ percent 100.0)
     :result   (table-rows-sample table fields rff (-> (perf/select-keys opts [:truncation-size])
                                                       (assoc :table-sample {:percent percent}
                                                              :limit        (* block-sample-limit-factor rows))))}
    {:method :first-rows}))

(defmethod driver/table-rows-sample :default
  [_driver table fields rff opts]
  (table-rows-sample table fields rff opts))
