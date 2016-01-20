(ns metabase.models.query-execution
  (:require [metabase.models.interface :as i]))


(i/defentity QueryExecution :query_queryexecution)

(defn- post-select [{:keys [result_rows] :as query-execution}]
  ;; sadly we have 2 ways to reference the row count :(
  (assoc query-execution :row_count (or result_rows 0)))

(extend (class QueryExecution)
  i/IEntity
  (merge i/IEntityDefaults
         {:default-fields (constantly [:id :uuid :version :json_query :raw_query :status :started_at :finished_at :running_time :error :result_rows])
          :types          (constantly {:json_query :json, :result_data :json, :status :keyword})
          :post-select    post-select}))
