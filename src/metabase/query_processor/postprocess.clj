(ns metabase.query-processor.postprocess
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.add-remaps :as qp.add-remaps]
   [metabase.query-processor.middleware.add-rows-truncated :as qp.add-rows-truncated]
   [metabase.query-processor.middleware.add-timezone-info :as qp.add-timezone-info]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.middleware.cumulative-aggregations :as qp.cumulative-aggregations]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
   [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
   [metabase.query-processor.middleware.format-rows :as format-rows]
   [metabase.query-processor.middleware.large-int :as large-int]
   [metabase.query-processor.middleware.limit :as limit]
   [metabase.query-processor.middleware.pivot-export :as pivot-export]
   [metabase.query-processor.middleware.results-metadata :as results-metadata]
   [metabase.query-processor.middleware.visualization-settings :as viz-settings]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

;;; the following helper functions are temporary, to aid in the transition from a legacy MBQL QP to a pMBQL QP. Each
;;; individual middleware function is wrapped in either [[ensure-legacy]] or [[ensure-pmbql]], and will then see the
;;; flavor of MBQL it is written for.

(defn- ^:deprecated ensure-legacy [middleware-fn]
  (-> (fn [query rff]
        (let [query (cond-> query
                      (:lib/type query) lib/->legacy-MBQL)]
          (-> (middleware-fn query rff)
              (vary-meta assoc :converted-form query))))
      (with-meta (meta middleware-fn))))

(defn- ensure-pmbql [middleware-fn]
  (-> (fn [query rff]
        (let [query (cond->> query
                      (not (:lib/type query)) (lib/query (qp.store/metadata-provider)))]
          (-> (middleware-fn query rff)
              (vary-meta assoc :converted-form query))))
      (with-meta (meta middleware-fn))))

(def ^:private middleware
  "Post-processing middleware that transforms results. Has the form

    (f preprocessed-query rff) -> rff

  Where `rff` has the form

    (f metadata) -> rf"
  #_{:clj-kondo/ignore [:deprecated-var]}
  [(ensure-legacy #'format-rows/format-rows)
   (ensure-legacy #'results-metadata/record-and-return-metadata!)
   (ensure-legacy #'limit/limit-result-rows)
   (ensure-legacy #'qp.middleware.enterprise/limit-download-result-rows)
   (ensure-legacy #'qp.add-rows-truncated/add-rows-truncated)
   (ensure-legacy #'qp.add-timezone-info/add-timezone-info)
   (ensure-legacy #'qp.middleware.enterprise/merge-sandboxing-metadata)
   (ensure-legacy #'qp.add-remaps/remap-results)
   (ensure-legacy #'pivot-export/add-data-for-pivot-export)
   (ensure-legacy #'large-int/convert-large-int-to-string)
   (ensure-legacy #'viz-settings/update-viz-settings)
   (ensure-legacy #'qp.cumulative-aggregations/sum-cumulative-aggregation-columns)
   (ensure-pmbql #'annotate/add-column-info)
   (ensure-legacy #'fetch-source-query/add-dataset-info)])
;; ↑↑↑ POST-PROCESSING ↑↑↑ happens from BOTTOM TO TOP

(mu/defn post-processing-rff :- fn?
  "Apply post-processing middleware to `rff`. Returns an rff."
  [preprocessed-query :- [:map
                          [:database ::lib.schema.id/database]]
   rff                :- fn?]
  (qp.setup/with-qp-setup [preprocessed-query preprocessed-query]
    (try
      (reduce
       (fn [rff middleware-fn]
         (u/prog1 (cond->> rff
                    middleware-fn (middleware-fn preprocessed-query))
           (assert (fn? <>) (format "%s did not return a valid function" (pr-str middleware)))))
       rff
       middleware)
      (catch Throwable e
        (throw (ex-info (i18n/tru "Error building query results reducing function: {0}" (ex-message e))
                        {:query preprocessed-query, :type qp.error-type/qp}
                        e))))))
