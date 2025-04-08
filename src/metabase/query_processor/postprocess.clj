(ns metabase.query-processor.postprocess
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.add-dimension-projections :as qp.add-dimension-projections]
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
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

;; TODO: find a better place to put this. can't be in qp.pivot due to circular deps
(defn merge-base-pivot-query-metadata
  "Post-processing middleware. Replaces columns in metadata of pivot query with the columns of the base (un-pivoted) query."
  [{:keys [non-pivoted-cols]} rff]
  (fn merge-base-pivot-query-metadata-rff* [metadata]
    (def metadata metadata)
    (if non-pivoted-cols
      (rff (assoc metadata
                  :cols non-pivoted-cols
                  :pivot_cols (:cols metadata)))
      (rff metadata))))

(def ^:private middleware
  "Post-processing middleware that transforms results. Has the form

    (f preprocessed-query rff) -> rff

  Where `rff` has the form

    (f metadata) -> rf"
  [#'format-rows/format-rows
   #'results-metadata/record-and-return-metadata!
   #'limit/limit-result-rows
   #'qp.middleware.enterprise/limit-download-result-rows
   #'qp.add-rows-truncated/add-rows-truncated
   #'qp.add-timezone-info/add-timezone-info
   #'qp.middleware.enterprise/merge-sandboxing-metadata
   #'merge-base-pivot-query-metadata
   #'qp.add-dimension-projections/remap-results
   #'pivot-export/add-data-for-pivot-export
   #'large-int/convert-large-int-to-string
   #'viz-settings/update-viz-settings
   #'qp.cumulative-aggregations/sum-cumulative-aggregation-columns
   #'annotate/add-column-info
   #'fetch-source-query/add-dataset-info])
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
