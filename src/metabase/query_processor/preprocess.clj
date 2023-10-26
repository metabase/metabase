(ns metabase.query-processor.preprocess
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
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
   [metabase.query-processor.setup :as qp.setup]
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

(defn- ^:deprecated legacy-middleware [f]
  (fn [mlv2-query]
    (let [legacy-query (lib.convert/->legacy-MBQL mlv2-query)
          legacy-query' (f legacy-query)]
      (if (= legacy-query legacy-query')
        mlv2-query
        (lib/query mlv2-query (lib.convert/->pMBQL legacy-query'))))))

(def ^:private middleware
  "Pre-processing middleware. Has the form

    (f query) -> query"
  ;; ↓↓↓ PRE-PROCESSING ↓↓↓ happens from TOP TO BOTTOM
  #_{:clj-kondo/ignore [:deprecated-var]}
  [#'qp.normalize/normalize
   #'qp.perms/remove-permissions-key
   #'validate/validate-query
   (legacy-middleware #'expand-macros/expand-macros)
   (legacy-middleware #'qp.resolve-referenced/resolve-referenced-card-resources)
   (legacy-middleware #'parameters/substitute-parameters)
   (legacy-middleware #'qp.resolve-source-table/resolve-source-tables)
   (legacy-middleware #'qp.auto-bucket-datetimes/auto-bucket-datetimes)
   (legacy-middleware #'reconcile-bucketing/reconcile-breakout-and-order-by-bucketing)
   (legacy-middleware #'qp.add-source-metadata/add-source-metadata-for-source-queries)
   (legacy-middleware #'upgrade-field-literals/upgrade-field-literals)
   (legacy-middleware #'ee-middleware-apply-sandboxing)
   (legacy-middleware #'qp.persistence/substitute-persisted-query)
   #'qp.add-implicit-clauses/add-implicit-mbql-clauses
   (legacy-middleware #'qp.add-dimension-projections/add-remapped-columns)
   #'qp.resolve-fields/resolve-fields
   (legacy-middleware #'binning/update-binning-strategy)
   (legacy-middleware #'desugar/desugar)
   (legacy-middleware #'qp.add-default-temporal-unit/add-default-temporal-unit)
   (legacy-middleware #'qp.add-implicit-joins/add-implicit-joins)
   (legacy-middleware #'resolve-joins/resolve-joins)
   (legacy-middleware #'resolve-joined-fields/resolve-joined-fields)
   (legacy-middleware #'fix-bad-refs/fix-bad-references)
   (legacy-middleware #'escape-join-aliases/escape-join-aliases)
   ;; yes, this is called a second time, because we need to handle any joins that got added
   (legacy-middleware #'ee-middleware-apply-sandboxing)
   (legacy-middleware #'qp.cumulative-aggregations/rewrite-cumulative-aggregations)
   (legacy-middleware #'qp.pre-alias-aggregations/pre-alias-aggregations)
   (legacy-middleware #'qp.wrap-value-literals/wrap-value-literals)
   (legacy-middleware #'auto-parse-filter-values/auto-parse-filter-values)
   (legacy-middleware #'validate-temporal-bucketing/validate-temporal-bucketing)
   (legacy-middleware #'optimize-temporal-filters/optimize-temporal-filters)
   #'limit/add-default-limit
   (legacy-middleware #'ee-middleware-apply-download-limit)
   (legacy-middleware #'check-features/check-features)])

(def ^:private ^:dynamic *preprocessing-level* 1)

(def ^:private ^:const max-preprocessing-level 20)

(defn- do-with-max-preprocessing-level [thunk]
  (binding [*preprocessing-level* (inc *preprocessing-level*)]
    (when (>= *preprocessing-level* max-preprocessing-level)
      (throw (ex-info (str (tru "Infinite loop detected: recursively preprocessed query {0} times."
                                max-preprocessing-level))
                      {:type qp.error-type/qp})))
    (thunk)))

(defn preprocess
  "All [[middleware]] combined into a single function. This still needs to be ran in the context
  of [[around-middleware]]. If you want to preprocess a query in isolation use [[preprocess]] below which combines
  this with the [[around-middleware]]."
  [query]
  (qp.setup/do-with-qp-setup
   query
   (^:once fn* [query]
    (do-with-max-preprocessing-level
     (^:once fn* []
      (reduce
       (fn [query middleware-fn]
         (u/prog1 (middleware-fn query)
           (assert (map? <>) (format "%s did not return a valid query" (pr-str middleware)))))
       query
       middleware))))))
