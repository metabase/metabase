(ns metabase.query-processor.preprocess
  (:require
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.query-processor.debug :as qp.debug]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.add-default-temporal-unit :as qp.add-default-temporal-unit]
   [metabase.query-processor.middleware.add-implicit-clauses :as qp.add-implicit-clauses]
   [metabase.query-processor.middleware.add-implicit-joins :as qp.add-implicit-joins]
   [metabase.query-processor.middleware.add-remaps :as qp.add-remaps]
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
   [metabase.query-processor.middleware.expand-aggregations :as expand-aggregations]
   [metabase.query-processor.middleware.expand-macros :as expand-macros]
   [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
   [metabase.query-processor.middleware.fix-bad-references :as fix-bad-refs]
   [metabase.query-processor.middleware.limit :as limit]
   [metabase.query-processor.middleware.metrics :as metrics]
   [metabase.query-processor.middleware.normalize-query :as normalize]
   [metabase.query-processor.middleware.optimize-temporal-filters :as optimize-temporal-filters]
   [metabase.query-processor.middleware.parameters :as parameters]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.middleware.persistence :as qp.persistence]
   [metabase.query-processor.middleware.pre-alias-aggregations :as qp.pre-alias-aggregations]
   [metabase.query-processor.middleware.reconcile-breakout-and-order-by-bucketing :as reconcile-bucketing]
   [metabase.query-processor.middleware.remove-inactive-field-refs :as qp.remove-inactive-field-refs]
   [metabase.query-processor.middleware.resolve-fields :as qp.resolve-fields]
   [metabase.query-processor.middleware.resolve-joined-fields :as resolve-joined-fields]
   [metabase.query-processor.middleware.resolve-joins :as resolve-joins]
   [metabase.query-processor.middleware.resolve-referenced :as qp.resolve-referenced]
   [metabase.query-processor.middleware.resolve-source-table :as qp.resolve-source-table]
   [metabase.query-processor.middleware.validate :as validate]
   [metabase.query-processor.middleware.validate-temporal-bucketing :as validate-temporal-bucketing]
   [metabase.query-processor.middleware.wrap-value-literals :as qp.wrap-value-literals]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

;;; the following helper functions are temporary, to aid in the transition from a legacy MBQL QP to a pMBQL QP. Each
;;; individual middleware function is wrapped in either [[ensure-legacy]] or [[ensure-pmbql]], and will then see the
;;; flavor of MBQL it is written for.

(mu/defn- ->legacy :- mbql.s/Query
  [query :- [:map
             [:database ::lib.schema.id/database]]]
  (lib/->legacy-MBQL query))

(defn- ^:deprecated ensure-legacy [middleware-fn]
  (-> (fn [query]
        (let [query (cond-> query
                      (:lib/type query) ->legacy)]
          (vary-meta (middleware-fn query)
                     assoc :converted-form query)))
      (with-meta (meta middleware-fn))))

(mu/defn- ->mbql-5 :- ::lib.schema/query
  [query :- [:map
             [:database ::lib.schema.id/database]
             ;; sanity check: info should only get added in Clojure-land and shouldn't get transformed back and forth
             ;; from JSON; make sure it's in the expected shape
             [:info {:optional true} [:maybe ::lib.schema.info/info]]]]
  (cond->> query
    (not (:lib/type query)) (lib/query (qp.store/metadata-provider))))

(defn- ensure-pmbql [middleware-fn]
  (-> (fn [query]
        (let [query (->mbql-5 query)]
          (vary-meta (middleware-fn query)
                     assoc :converted-form query)))
      (with-meta (meta middleware-fn))))

(def ^:private unconverted-property?
  (some-fn #{:info} qualified-keyword?))

(defn- copy-unconverted-properties
  [to from]
  (reduce-kv (fn [m k v]
               (cond-> m
                 (unconverted-property? k) (assoc k v)))
             to
             from))

;;; TODO -- this is broken and disables enforcement inside the middleware itself -- see QUE-1346
(defn- ensure-pmbql-for-unclean-query
  [middleware-fn]
  (-> (fn [query]
        (mu/disable-enforcement
          (lib/without-cleaning
           (fn []
             (let [query' (-> (cond->> query
                                (not (:lib/type query)) (lib/query (qp.store/metadata-provider)))
                              (copy-unconverted-properties query))]
               (-> query' middleware-fn ->legacy))))))
      (with-meta (meta middleware-fn))))

(def ^:private middleware
  "Pre-processing middleware. Has the form

    (f query) -> query"
  ;; ↓↓↓ PRE-PROCESSING ↓↓↓ happens from TOP TO BOTTOM
  #_{:clj-kondo/ignore [:deprecated-var]}
  [#'normalize/normalize-preprocessing-middleware
   (ensure-pmbql #'qp.perms/remove-permissions-key)
   (ensure-pmbql #'qp.perms/remove-source-card-keys)
   (ensure-pmbql #'qp.perms/remove-gtapped-table-keys)
   (ensure-pmbql #'qp.constraints/maybe-add-default-userland-constraints)
   (ensure-pmbql #'validate/validate-query)
   (ensure-pmbql #'fetch-source-query/resolve-source-cards)
   (ensure-pmbql #'expand-aggregations/expand-aggregations)
   (ensure-pmbql #'metrics/adjust)
   (ensure-pmbql #'expand-macros/expand-macros)
   (ensure-pmbql #'qp.resolve-referenced/resolve-referenced-card-resources)
   (ensure-legacy #'parameters/substitute-parameters)
   (ensure-pmbql #'qp.resolve-source-table/resolve-source-tables)
   (ensure-pmbql #'qp.auto-bucket-datetimes/auto-bucket-datetimes)
   (ensure-legacy #'reconcile-bucketing/reconcile-breakout-and-order-by-bucketing)
   (ensure-legacy #'qp.add-source-metadata/add-source-metadata-for-source-queries)
   (ensure-pmbql #'qp.middleware.enterprise/apply-impersonation)
   (ensure-pmbql #'qp.middleware.enterprise/attach-destination-db-middleware)
   (ensure-legacy #'qp.middleware.enterprise/apply-sandboxing)
   (ensure-legacy #'qp.persistence/substitute-persisted-query)
   (ensure-legacy #'qp.add-implicit-clauses/add-implicit-clauses)
   (ensure-pmbql #'qp.add-remaps/add-remapped-columns)
   (ensure-legacy #'qp.resolve-fields/resolve-fields)
   (ensure-legacy #'binning/update-binning-strategy)
   (ensure-legacy #'desugar/desugar)
   (ensure-legacy #'qp.add-default-temporal-unit/add-default-temporal-unit)
   (ensure-pmbql #'qp.add-implicit-joins/add-implicit-joins)
   (ensure-legacy #'resolve-joins/resolve-joins)
   (ensure-legacy #'resolve-joined-fields/resolve-joined-fields)
   (ensure-legacy #'fix-bad-refs/fix-bad-references)
   (ensure-pmbql-for-unclean-query #'qp.remove-inactive-field-refs/remove-inactive-field-refs)
   ;; yes, this is called a second time, because we need to handle any joins that got added
   (ensure-legacy #'qp.middleware.enterprise/apply-sandboxing)
   (ensure-legacy #'qp.cumulative-aggregations/rewrite-cumulative-aggregations)
   (ensure-legacy #'qp.pre-alias-aggregations/pre-alias-aggregations)
   (ensure-legacy #'qp.wrap-value-literals/wrap-value-literals)
   (ensure-pmbql-for-unclean-query #'auto-parse-filter-values/auto-parse-filter-values)
   (ensure-legacy #'validate-temporal-bucketing/validate-temporal-bucketing)
   (ensure-legacy #'optimize-temporal-filters/optimize-temporal-filters)
   (ensure-legacy #'limit/add-default-limit)
   (ensure-legacy #'qp.middleware.enterprise/apply-download-limit)
   (ensure-legacy #'check-features/check-features)])

(defn- middleware-fn-name [middleware-fn]
  (if-let [fn-name (:name (meta middleware-fn))]
    (if-let [fn-ns (:ns (meta middleware-fn))]
      (symbol (format "%s/%s" (ns-name fn-ns) fn-name))
      fn-name)
    middleware-fn))

(mu/defn preprocess :- [:map
                        [:database ::lib.schema.id/database]]
  "Fully preprocess a query, but do not compile it to a native query or execute it."
  [query :- :map]
  (qp.setup/with-qp-setup [query query]
    (qp.debug/debug> (list `preprocess query))
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
            (qp.debug/debug>
              (when-not (= <> query)
                (let [middleware-fn-name (middleware-fn-name middleware-fn)]
                  (list middleware-fn-name '=> <>
                        ^{:portal.viewer/default :portal.viewer/diff}
                        [(or (-> <> meta :converted-form) query)
                         <>]))))
            ;; make sure the middleware returns a valid query... this should be dev-facing only so no need to i18n
            (when-not (map? <>)
              (throw (ex-info (format "Middleware did not return a valid query.")
                              {:fn (middleware-fn-name middleware-fn), :query query, :result <>, :type qp.error-type/qp}))))
          (catch Throwable e
            (let [middleware-fn (middleware-fn-name middleware-fn)]
              (throw (ex-info (i18n/tru "Error preprocessing query in {0}: {1}" middleware-fn (ex-message e))
                              {:fn middleware-fn, :query query, :type qp.error-type/qp}
                              e)))))))
     query
     middleware)))

(mu/defn query->expected-cols :- [:maybe [:sequential ::mbql.s/legacy-column-metadata]]
  "Return the `:cols` you would normally see in MBQL query results by preprocessing the query and calling `annotate` on
  it. This only works for pure MBQL queries, since it does not actually run the queries. Native queries or MBQL
  queries with native source queries won't work, since we don't need the results."
  [query :- :map]
  (qp.setup/with-qp-setup [query query]
    (let [preprocessed (-> query preprocess)]
      (when-not (= (:type preprocessed) :query)
        (throw (ex-info (i18n/tru "Can only determine expected columns for MBQL queries.")
                        {:type qp.error-type/qp})))
      ;; TODO - we should throw an Exception if the query has a native source query or at least warn about it. Need to
      ;; check where this is used.
      (not-empty (annotate/expected-cols (->mbql-5 preprocessed))))))
