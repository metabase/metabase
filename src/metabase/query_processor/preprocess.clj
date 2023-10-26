(ns metabase.query-processor.preprocess
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.add-default-temporal-unit :as qp.add-default-temporal-unit]
   [metabase.query-processor.middleware.add-dimension-projections :as qp.add-dimension-projections]
   [metabase.query-processor.middleware.add-implicit-clauses :as qp.add-implicit-clauses]
   [metabase.query-processor.middleware.add-implicit-joins :as qp.add-implicit-joins]
   [metabase.query-processor.middleware.add-source-metadata :as qp.add-source-metadata]
   [metabase.query-processor.middleware.auto-bucket-datetimes :as qp.auto-bucket-datetimes]
   [metabase.query-processor.middleware.auto-parse-filter-values :as auto-parse-filter-values]
   [metabase.query-processor.middleware.binning :as binning]
   [metabase.query-processor.middleware.check-features :as check-features]
   [metabase.query-processor.middleware.cumulative-aggregations :as qp.cumulative-aggregations]
   [metabase.query-processor.middleware.desugar :as desugar]
   [metabase.query-processor.middleware.escape-join-aliases :as escape-join-aliases]
   [metabase.query-processor.middleware.expand-macros :as expand-macros]
   [metabase.query-processor.middleware.fix-bad-references :as fix-bad-refs]
   [metabase.query-processor.middleware.limit :as limit]
   [metabase.query-processor.middleware.optimize-temporal-filters :as optimize-temporal-filters]
   [metabase.query-processor.middleware.parameters :as parameters]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.middleware.persistence :as qp.persistence]
   [metabase.query-processor.middleware.pre-alias-aggregations :as qp.pre-alias-aggregations]
   [metabase.query-processor.middleware.reconcile-breakout-and-order-by-bucketing :as reconcile-bucketing]
   [metabase.query-processor.middleware.resolve-fields :as qp.resolve-fields]
   [metabase.query-processor.middleware.resolve-joined-fields :as resolve-joined-fields]
   [metabase.query-processor.middleware.resolve-joins :as resolve-joins]
   [metabase.query-processor.middleware.resolve-referenced :as qp.resolve-referenced]
   [metabase.query-processor.middleware.resolve-source-table :as qp.resolve-source-table]
   [metabase.query-processor.middleware.upgrade-field-literals :as upgrade-field-literals]
   [metabase.query-processor.middleware.validate :as validate]
   [metabase.query-processor.middleware.validate-temporal-bucketing :as validate-temporal-bucketing]
   [metabase.query-processor.middleware.wrap-value-literals :as qp.wrap-value-literals]
   [metabase.query-processor.normalize :as qp.normalize]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(defenterprise ee-middleware-apply-download-limit
  "EE-only: apply a limit to the number of rows for downloads based on EE user perms."
  metabase-enterprise.advanced-permissions.query-processor.middleware.permissions
  [query]
  query)

(defenterprise ee-middleware-apply-sandboxing
  "EE-only: apply sandboxing to the current query."
  metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions
  [query]
  query)

(def ^:private middleware
  "Pre-processing middleware. Has the form

    (f query) -> query"
  ;; ↓↓↓ PRE-PROCESSING ↓↓↓ happens from TOP TO BOTTOM
  [#'qp.perms/remove-permissions-key
   #'validate/validate-query
   #_#'expand-macros/expand-macros
   #_#'qp.resolve-referenced/resolve-referenced-card-resources
   #_#'parameters/substitute-parameters
   #_#'qp.resolve-source-table/resolve-source-tables
   #_#'qp.auto-bucket-datetimes/auto-bucket-datetimes
   #_#'reconcile-bucketing/reconcile-breakout-and-order-by-bucketing
   #_#'qp.add-source-metadata/add-source-metadata-for-source-queries
   #_#'upgrade-field-literals/upgrade-field-literals
   #_#'ee-middleware-apply-sandboxing
   #_#'qp.persistence/substitute-persisted-query
   #'qp.add-implicit-clauses/add-implicit-mbql-clauses
   #_#'qp.add-dimension-projections/add-remapped-columns
   #'qp.resolve-fields/resolve-fields
   #_#'binning/update-binning-strategy
   #_#'desugar/desugar
   #_#'qp.add-default-temporal-unit/add-default-temporal-unit
   #_#'qp.add-implicit-joins/add-implicit-joins
   #_#'resolve-joins/resolve-joins
   #_#'resolve-joined-fields/resolve-joined-fields
   #_#'fix-bad-refs/fix-bad-references
   #_#'escape-join-aliases/escape-join-aliases
   ;; yes, this is called a second time, because we need to handle any joins that got added
   #_#'ee-middleware-apply-sandboxing
   #_#'qp.cumulative-aggregations/rewrite-cumulative-aggregations
   #_#'qp.pre-alias-aggregations/pre-alias-aggregations
   #_#'qp.wrap-value-literals/wrap-value-literals
   #_#'auto-parse-filter-values/auto-parse-filter-values
   #_#'validate-temporal-bucketing/validate-temporal-bucketing
   #_#'optimize-temporal-filters/optimize-temporal-filters
   #'limit/add-default-limit
   #_#'ee-middleware-apply-download-limit
   #_#'check-features/check-features])

;; NOCOMMIT
(comment
  (defn x []
    (metabase.query-processor.preprocess/preprocess
     (metabase.test/mbql-query checkins))))

(def ^:private ^:dynamic *preprocessing-level* 1)

(def ^:private ^:const max-preprocessing-level 20)

(defn preprocess
  "All [[middleware]] combined into a single function. This still needs to be ran in the context
  of [[around-middleware]]. If you want to preprocess a query in isolation use [[preprocess]] below which combines
  this with the [[around-middleware]]."
  [query]
  (let [{database-id :database, :as query} (qp.normalize/normalize query)]
    (qp.store/with-metadata-provider (if (qp.store/initialized?)
                                       (qp.store/metadata-provider)
                                       (or (:lib/metadata query)
                                           database-id))
      (let [query (if (:lib/metadata query)
                    query
                    (assoc query :lib/metadata (qp.store/metadata-provider)))]
        (driver/with-driver (or driver/*driver* (driver.u/database->driver database-id))
          (binding [*preprocessing-level* (inc *preprocessing-level*)]
            (when (>= *preprocessing-level* max-preprocessing-level)
              (throw (ex-info (str (tru "Infinite loop detected: recursively preprocessed query {0} times."
                                        max-preprocessing-level))
                              {:type qp.error-type/qp})))
            (reduce
             (fn [query middleware]
               (u/prog1 (cond-> query
                          middleware middleware)
                 (assert (map? <>) (format "%s did not return a valid query" (pr-str middleware)))))
             query
             middleware)))))))
