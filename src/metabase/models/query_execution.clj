(ns metabase.models.query-execution
  (:require [toucan.models :as models]
            [metabase.util :as u]))


(models/defmodel QueryExecution :query_queryexecution)

(defn- post-select [{:keys [result_rows] :as query-execution}]
  ;; sadly we have 2 ways to reference the row count :(
  (assoc query-execution :row_count (or result_rows 0)))

(u/strict-extend (class QueryExecution)
  models/IModel
  (merge models/IModelDefaults
         {:default-fields (constantly [:id :uuid :version :json_query :raw_query :status :started_at :finished_at :running_time :error :result_rows])
          :types          (constantly {:json_query :json, :result_data :json, :status :keyword, :raw_query :clob, :error :clob, :additional_info :clob})
          :post-select    post-select}))
