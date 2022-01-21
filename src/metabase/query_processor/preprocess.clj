(ns metabase.query-processor.preprocess
  (:require [clojure.tools.logging :as log]
            [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.mbql.util :as mbql.u]
            [metabase.plugins.classloader :as classloader]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.middleware.add-default-temporal-unit :as add-default-temporal-unit]
            [metabase.query-processor.middleware.add-dimension-projections :as add-dim]
            [metabase.query-processor.middleware.add-implicit-clauses :as implicit-clauses]
            [metabase.query-processor.middleware.add-implicit-joins :as add-implicit-joins]
            [metabase.query-processor.middleware.add-source-metadata :as add-source-metadata]
            [metabase.query-processor.middleware.annotate :as annotate]
            [metabase.query-processor.middleware.auto-bucket-datetimes :as bucket-datetime]
            [metabase.query-processor.middleware.auto-parse-filter-values :as auto-parse-filter-values]
            [metabase.query-processor.middleware.binning :as binning]
            [metabase.query-processor.middleware.check-features :as check-features]
            [metabase.query-processor.middleware.cumulative-aggregations :as cumulative-ags]
            [metabase.query-processor.middleware.desugar :as desugar]
            [metabase.query-processor.middleware.expand-macros :as expand-macros]
            [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
            [metabase.query-processor.middleware.fix-bad-references :as fix-bad-refs]
            [metabase.query-processor.middleware.limit :as limit]
            [metabase.query-processor.middleware.normalize-query :as normalize]
            [metabase.query-processor.middleware.optimize-temporal-filters :as optimize-temporal-filters]
            [metabase.query-processor.middleware.parameters :as parameters]
            [metabase.query-processor.middleware.pre-alias-aggregations :as pre-alias-ags]
            [metabase.query-processor.middleware.reconcile-breakout-and-order-by-bucketing :as reconcile-bucketing]
            [metabase.query-processor.middleware.resolve-fields :as resolve-fields]
            [metabase.query-processor.middleware.resolve-joined-fields :as resolve-joined-fields]
            [metabase.query-processor.middleware.resolve-joins :as resolve-joins]
            [metabase.query-processor.middleware.resolve-referenced :as resolve-referenced]
            [metabase.query-processor.middleware.resolve-source-table :as resolve-source-table]
            [metabase.query-processor.middleware.upgrade-field-literals :as upgrade-field-literals]
            [metabase.query-processor.middleware.validate :as validate]
            [metabase.query-processor.middleware.validate-temporal-bucketing :as validate-temporal-bucketing]
            [metabase.query-processor.middleware.visualization-settings :as viz-settings]
            [metabase.query-processor.middleware.wrap-value-literals :as wrap-value-literals]
            [metabase.query-processor.process-common :as process-common]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]))

(u/ignore-exceptions
  (classloader/require 'metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions))

(def ^:private middleware
  ;;; Preprocessing is done from top to bottom.
  [#'normalize/normalize
   #'validate/validate-query
   #'fetch-source-query/resolve-card-id-source-tables ; TODO -- need to handle `::dataset?` in metadata.
   #'expand-macros/expand-macros
   #'resolve-referenced/resolve-referenced-card-resources
   #'parameters/substitute-parameters
   #'resolve-source-table/resolve-source-tables
   #'bucket-datetime/auto-bucket-datetimes
   #'reconcile-bucketing/reconcile-breakout-and-order-by-bucketing
   #'add-source-metadata/add-source-metadata-for-source-queries
   #'upgrade-field-literals/upgrade-field-literals
   (resolve 'metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions/apply-row-level-permissions-pre) ; TODO
   #'implicit-clauses/add-implicit-clauses
   #'add-dim/add-remapping-pre
   #'resolve-fields/resolve-fields
   #'binning/update-binning-strategy
   #'desugar/desugar
   #'add-default-temporal-unit/add-default-temporal-unit
   #'add-implicit-joins/add-implicit-joins
   #'resolve-joins/resolve-joins
   #'resolve-joined-fields/resolve-joined-fields
   #'fix-bad-refs/fix-bad-references
   #'viz-settings/update-viz-settings-pre ; TODO
   ;; yes, this is called a second time, because we need to handle any joins that got added
   (resolve 'metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions/apply-row-level-permissions-pre) ; TODO
   #'cumulative-ags/rewrite-cumulative-aggregations
   #'pre-alias-ags/pre-alias-aggregations
   #'wrap-value-literals/wrap-value-literals
   #'auto-parse-filter-values/auto-parse-filter-values
   #'validate-temporal-bucketing/validate-temporal-bucketing
   #'optimize-temporal-filters/optimize-temporal-filters
   #'limit/add-default-limit
   #'check-features/check-features])

(def ^:private ^:dynamic *preprocessing-level* 1)

(def ^:private ^:const max-preprocessing-level 20)

(defn preprocess
  [query]
  ;; record the number of recursive preprocesses taking place to prevent infinite preprocessing loops.
  (binding [*preprocessing-level* (inc *preprocessing-level*)]
    (log/tracef "*preprocessing-level*: %d" *preprocessing-level*)
    (when (>= *preprocessing-level* max-preprocessing-level)
      (throw (ex-info (str (tru "Infinite loop detected: recursively preprocessed query {0} times."
                                max-preprocessing-level))
                      {:type error-type/qp})))
    (process-common/ensure-store-and-driver query
      (try
        (reduce
         (fn [query middleware]
           (if middleware
             (let [query' (middleware query)]
               (assert query' (str "MIDDLEWARE DID NOT RETURN QUERY::" middleware))
               query')
             query))
         query
         middleware)
        (catch Throwable e
          (throw (ex-info (tru "Error pre-processing query: {0}" (ex-message e))
                          {:query query
                           :type  (:type (ex-data e) error-type/qp)}
                          e)))))))

(defn query->expected-cols
  "Return the `:cols` you would normally see in MBQL query results by preprocessing the query and calling `annotate` on
  it. This only works for pure MBQL queries, since it does not actually run the queries. Native queries or MBQL
  queries with native source queries won't work, since we don't need the results."
  [{query-type :type, :as query}]
  (when-not (= (mbql.u/normalize-token query-type) :query)
    (throw (ex-info (tru "Can only determine expected columns for MBQL queries.")
             {:type error-type/qp})))
  ;; TODO - we should throw an Exception if the query has a native source query or at least warn about it. Need to
  ;; check where this is used.
  (process-common/ensure-store-and-driver query
    (let [preprocessed (preprocess query)]
      (driver/with-driver (driver.u/database->driver (:database preprocessed))
        (not-empty (vec (annotate/merged-column-info preprocessed nil)))))))
