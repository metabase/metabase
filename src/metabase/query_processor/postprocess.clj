(ns metabase.query-processor.postprocess
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
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
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(def ^:private middleware
  "Post-processing middleware that transforms results. Has the form

    (f preprocessed-query rff) -> rff

  Where `rff` has the form

    (f metadata) -> rf"
  [[::mbql5  #'format-rows/format-rows]
   [::mbql5  #'results-metadata/record-and-return-metadata!]
   [::mbql5  #'limit/limit-result-rows]
   [::mbql5  #'qp.middleware.enterprise/limit-download-result-rows]
   [::mbql5  #'qp.add-rows-truncated/add-rows-truncated]
   [::mbql5  #'qp.add-timezone-info/add-timezone-info]
   [::mbql5  #'qp.middleware.enterprise/merge-sandboxing-metadata]
   [::mbql5  #'qp.add-remaps/remap-results]
   [::mbql5  #'pivot-export/add-data-for-pivot-export]
   [::mbql5  #'large-int/convert-large-int-to-string]
   [::mbql5  #'viz-settings/update-viz-settings]
   [::mbql5  #'qp.cumulative-aggregations/sum-cumulative-aggregation-columns]
   [::mbql5  #'annotate/add-column-info]
   [::mbql5  #'fetch-source-query/add-dataset-info]])
;; ↑↑↑ POST-PROCESSING ↑↑↑ happens from BOTTOM TO TOP

(mu/defn post-processing-rff :- ::qp.schema/rff
  "Apply post-processing middleware to `rff`. Returns an rff."
  [preprocessed-query :- ::lib.schema/query
   rff                :- ::qp.schema/rff]
  (qp.setup/with-qp-setup [preprocessed-query preprocessed-query]
    (let [legacy-query (lib/->legacy-MBQL preprocessed-query)]
      (try
        (reduce
         (fn [rff [middleware-expected-mbql-version middleware-fn]]
           (u/prog1 (middleware-fn
                     (case middleware-expected-mbql-version
                       ::mbql5 preprocessed-query
                       ::legacy legacy-query)
                     rff)
             (assert (fn? <>) (format "%s did not return a valid function" (pr-str middleware)))))
         rff
         middleware)
        (catch Throwable e
          (throw (ex-info (i18n/tru "Error building query results reducing function: {0}" (ex-message e))
                          {:query preprocessed-query, :type qp.error-type/qp}
                          e)))))))
