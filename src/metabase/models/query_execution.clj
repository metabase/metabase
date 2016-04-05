(ns metabase.models.query-execution
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]))


(i/defentity QueryExecution :query_queryexecution)

(defn- post-select [{:keys [result_rows] :as query-execution}]
  ;; sadly we have 2 ways to reference the row count :(
  (assoc query-execution :row_count (or result_rows 0)))

(u/strict-extend (class QueryExecution)
  i/IEntity
  (merge i/IEntityDefaults
         {:default-fields (constantly [:id :uuid :version :json_query :raw_query :status :started_at :finished_at :running_time :error :result_rows])
          :types          (constantly {:json_query :json, :result_data :json, :status :keyword, :raw_query :clob, :error :clob, :additional_info :clob})
          :post-select    post-select}))
