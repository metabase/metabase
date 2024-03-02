(ns metabase.query-processor.preprocess
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.add-default-temporal-unit :as qp.add-default-temporal-unit]
   [metabase.query-processor.middleware.add-dimension-projections :as qp.add-dimension-projections]
   [metabase.query-processor.middleware.add-implicit-clauses :as qp.add-implicit-clauses]
   [metabase.query-processor.middleware.add-implicit-joins :as qp.add-implicit-joins]
   [metabase.query-processor.middleware.add-source-metadata :as qp.add-source-metadata]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.middleware.auto-bucket-datetimes :as qp.auto-bucket-datetimes]
   [metabase.query-processor.middleware.auto-parse-filter-values :as auto-parse-filter-values]
   [metabase.query-processor.middleware.binning :as binning]
   [metabase.query-processor.middleware.check-features :as check-features]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.cumulative-aggregations :as qp.cumulative-aggregations]
   [metabase.query-processor.middleware.desugar :as desugar]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
   [metabase.query-processor.middleware.escape-join-aliases :as escape-join-aliases]
   [metabase.query-processor.middleware.expand-macros :as expand-macros]
   [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
   [metabase.query-processor.middleware.fix-bad-references :as fix-bad-refs]
   [metabase.query-processor.middleware.limit :as limit]
   [metabase.query-processor.middleware.normalize-query :as normalize]
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
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(def ^:private middleware
  "Pre-processing middleware. Has the form

    (f query) -> query"
  ;; ↓↓↓ PRE-PROCESSING ↓↓↓ happens from TOP TO BOTTOM
  [#'normalize/normalize-preprocessing-middleware
   #'qp.perms/remove-permissions-key
   #'qp.constraints/maybe-add-default-userland-constraints
   #'validate/validate-query
   #'fetch-source-query/resolve-card-id-source-tables
   #'expand-macros/expand-macros
   #'qp.resolve-referenced/resolve-referenced-card-resources
   #'parameters/substitute-parameters
   #'qp.resolve-source-table/resolve-source-tables
   #'qp.auto-bucket-datetimes/auto-bucket-datetimes
   #'reconcile-bucketing/reconcile-breakout-and-order-by-bucketing
   #'qp.add-source-metadata/add-source-metadata-for-source-queries
   #'upgrade-field-literals/upgrade-field-literals
   #'qp.middleware.enterprise/apply-sandboxing
   #'qp.persistence/substitute-persisted-query
   #'qp.add-implicit-clauses/add-implicit-clauses
   #'qp.add-dimension-projections/add-remapped-columns
   #'qp.resolve-fields/resolve-fields
   #'binning/update-binning-strategy
   #'desugar/desugar
   #'qp.add-default-temporal-unit/add-default-temporal-unit
   #'qp.add-implicit-joins/add-implicit-joins
   #'resolve-joins/resolve-joins
   #'resolve-joined-fields/resolve-joined-fields
   #'fix-bad-refs/fix-bad-references
   #'escape-join-aliases/escape-join-aliases
   ;; yes, this is called a second time, because we need to handle any joins that got added
   #'qp.middleware.enterprise/apply-sandboxing
   #'qp.cumulative-aggregations/rewrite-cumulative-aggregations
   #'qp.pre-alias-aggregations/pre-alias-aggregations
   #'qp.wrap-value-literals/wrap-value-literals
   #'auto-parse-filter-values/auto-parse-filter-values
   #'validate-temporal-bucketing/validate-temporal-bucketing
   #'optimize-temporal-filters/optimize-temporal-filters
   #'limit/add-default-limit
   #'qp.middleware.enterprise/apply-download-limit
   #'check-features/check-features])

(mu/defn preprocess :- [:map
                        [:database ::lib.schema.id/database]]
  "Fully preprocess a query, but do not compile it to a native query or execute it."
  [query :- :map]
  (qp.setup/with-qp-setup [query query]
    (transduce
     identity
     (fn
       ([preprocessed]
        (log/debugf "Preprocessed query:\n\n%s" (u/pprint-to-str preprocessed))
        preprocessed)
       ([query middleware-fn]
        (try
          (assert (ifn? middleware-fn))
          ;; make sure the middleware returns a valid query... this should be dev-facing only so no need to i18n
          (u/prog1 (middleware-fn query)
            (when-not (map? <>)
              (throw (ex-info (format "Middleware did not return a valid query.")
                              {:fn middleware-fn, :query query, :type qp.error-type/qp}))))
          (catch Throwable e
            (throw (ex-info (i18n/tru "Error preprocessing query in {0}: {1}" middleware-fn (ex-message e))
                            {:fn middleware-fn, :query query, :type qp.error-type/qp}
                            e))))))
     query
     middleware)))

(defn- restore-join-aliases [preprocessed-query]
  (let [replacement (-> preprocessed-query :info :alias/escaped->original)]
    (escape-join-aliases/restore-aliases preprocessed-query replacement)))

(defn query->expected-cols
  "Return the `:cols` you would normally see in MBQL query results by preprocessing the query and calling `annotate` on
  it. This only works for pure MBQL queries, since it does not actually run the queries. Native queries or MBQL
  queries with native source queries won't work, since we don't need the results."
  [query]
  (qp.setup/with-qp-setup [query query]
    (let [preprocessed (-> query preprocess restore-join-aliases)]
      (when-not (= (:type preprocessed) :query)
        (throw (ex-info (i18n/tru "Can only determine expected columns for MBQL queries.")
                        {:type qp.error-type/qp})))
      ;; TODO - we should throw an Exception if the query has a native source query or at least warn about it. Need to
      ;; check where this is used.
      (->> (annotate/merged-column-info preprocessed nil)
           ;; remove MLv2 columns so we don't break a million tests. Once the whole QP is updated to use MLv2 metadata
           ;; directly we can stop stripping these out
           (mapv (fn [col]
                   (dissoc col :lib/external_remap :lib/internal_remap)))
           not-empty))))
