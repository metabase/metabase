(ns metabase.qp.preprocess
  (:require
   [metabase.config :as config]
   [metabase.lib.util.walk :as lib.util.walk]
   [metabase.plugins.classloader :as classloader]
   [metabase.qp.preprocess.add-default-join-strategy
    :as qp.pre.add-default-join-strategy]
   [metabase.qp.preprocess.add-implicit-clauses
    :as qp.pre.add-implicit-clauses]
   [metabase.qp.preprocess.normalize :as qp.pre.normalize]
   [metabase.qp.preprocess.resolve-join-fields
    :as
    qp.pre.resolve-join-fields]))

(when config/ee-available?
  (classloader/require '[metabase-enterprise.advanced-permissions.query-processor.middleware.permissions :as ee.perms]
                       '[metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries :as ee.audit]
                       '[metabase-enterprise.sandbox.query-processor.middleware
                         [column-level-perms-check :as ee.sandbox.columns]
                         [row-level-restrictions :as ee.sandbox.rows]]))

(def ^:private middleware
  "↓↓↓ PRE-PROCESSING ↓↓↓ happens from TOP TO BOTTOM"
  [#'qp.pre.normalize/normalize-middleware
   #_#'qp.perms/remove-permissions-key
   #_#'validate/validate-query
   #_#'expand-macros/expand-macros
   #_#'qp.resolve-referenced/resolve-referenced-card-resources
   #_#'parameters/substitute-parameters
   #_#'qp.resolve-source-table/resolve-source-tables
   #_#'qp.auto-bucket-datetimes/auto-bucket-datetimes
   #_#'reconcile-bucketing/reconcile-breakout-and-order-by-bucketing
   #_#'qp.add-source-metadata/add-source-metadata-for-source-queries
   #_#'upgrade-field-literals/upgrade-field-literals
   #_(resolve 'ee.sandbox.rows/apply-sandboxing)
   #_#'qp.persistence/substitute-persisted-query
   #'qp.pre.add-implicit-clauses/add-implicit-clauses-middleware
   #_#'qp.add-dimension-projections/add-remapped-columns
   #_#'qp.resolve-fields/resolve-fields
   #_#'binning/update-binning-strategy
   #_#'desugar/desugar
   #_#'qp.add-default-temporal-unit/add-default-temporal-unit
   #_#'qp.add-implicit-joins/add-implicit-joins
   #'qp.pre.add-default-join-strategy/add-default-join-strategy-middleware
   #'qp.pre.resolve-join-fields/resolve-join-fields-middleware
   #_#'fix-bad-refs/fix-bad-references
   #_#'escape-join-aliases/escape-join-aliases
   ;; yes, this is called a second time, because we need to handle any joins that got added
   #_(resolve 'ee.sandbox.rows/apply-sandboxing)
   #_#'qp.cumulative-aggregations/rewrite-cumulative-aggregations
   #_#'qp.pre-alias-aggregations/pre-alias-aggregations
   #_#'qp.wrap-value-literals/wrap-value-literals
   #_#'auto-parse-filter-values/auto-parse-filter-values
   #_#'validate-temporal-bucketing/validate-temporal-bucketing
   #_#'optimize-temporal-filters/optimize-temporal-filters
   #_#'limit/add-default-limit
   #_(resolve 'ee.perms/apply-download-limit)
   #_#'check-features/check-features])

(defn- grouped-middlewares
  []
  (into {}
        (map (fn [what]
               [what (into []
                           (keep (fn [f]
                                   (when f
                                     (f what))))
                           middleware)]))
        lib.util.walk/whats))

(defn- apply-middleware-fn [middleware-fns]
  (if (empty? middleware-fns)
    (fn identity-fn [x _context]
      x)
    (fn composed-middleware-fn [x context]
      (reduce
       (fn [x middleware]
         (or (middleware x context)
             x))
       x
       middleware-fns))))

(defn- combined-middlewares []
  (update-vals (grouped-middlewares) apply-middleware-fn))

(def ^:private walk-fns (combined-middlewares))

(defn preprocess [query]
  (lib.util.walk/walk-query query (fn [x context]
                                    ((walk-fns (:what context)) x context))))

(defn metadata [_query metadata]
  metadata)
