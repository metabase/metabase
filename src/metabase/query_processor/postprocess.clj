(ns metabase.query-processor.postprocess
  (:require [metabase.plugins.classloader :as classloader]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.middleware.add-dimension-projections :as add-dim]
            [metabase.query-processor.middleware.add-rows-truncated :as add-rows-truncated]
            [metabase.query-processor.middleware.add-timezone-info :as add-timezone-info]
            [metabase.query-processor.middleware.annotate :as annotate]
            [metabase.query-processor.middleware.cumulative-aggregations :as cumulative-ags]
            [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
            [metabase.query-processor.middleware.format-rows :as format-rows]
            [metabase.query-processor.middleware.large-int-id :as large-int-id]
            [metabase.query-processor.middleware.limit :as limit]
            [metabase.query-processor.middleware.splice-params-in-response :as splice-params-in-response]
            [metabase.query-processor.middleware.visualization-settings :as viz-settings]
            [metabase.query-processor.process-common :as process-common]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]))

(u/ignore-exceptions
  (classloader/require 'metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions))

(def ^:private middleware
  [#'limit/limit-result-rows
   (resolve 'metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions/apply-row-level-permissions-post)
   #'add-dim/add-remapping-post
   #'annotate/add-column-info
   #'cumulative-ags/post-process-cumulative-aggregations
   #'viz-settings/update-viz-settings-post
   #'large-int-id/convert-id-to-string
   #'format-rows/format-rows
   #'add-timezone-info/add-timezone-info
   #'splice-params-in-response/splice-params-in-response
   #'fetch-source-query/add-dataset-metadata
   #'add-rows-truncated/add-rows-truncated])

;; TODO -- can we make this `[metadata rf]` instead of `rff`?
(defn post-processing-xform [preprocessed-query rff]
  {:pre  [(map? preprocessed-query) (fn? rff)]
   :post [(fn? %)]}
  (process-common/ensure-store-and-driver preprocessed-query
    (try
      (reduce
       (fn [rff middleware]
         (if-not middleware
           rff
           (try
             (u/prog1 (middleware preprocessed-query rff)
               (assert (fn? <>)))
             (catch Throwable e
               (throw (ex-info (tru "Error applying post-processing middleware {0}: {1}" (pr-str middleware) (ex-message e))
                               {:middleware (pr-str middleware)
                                :type       (:type (ex-data e) qp.error-type/qp)}
                               e))))))
       rff
       middleware)
      (catch Throwable e
        (throw (ex-info (tru "Error building post-processing transform: {0}" (ex-message e))
                        {:query preprocessed-query
                         :type  (:type (ex-data e) qp.error-type/qp)}
                        e))))))
