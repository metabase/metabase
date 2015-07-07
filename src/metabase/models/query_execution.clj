(ns metabase.models.query-execution
  (:require [korma.core :refer :all, :exclude [defentity]]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [database :refer [Database]]
                             [interface :refer :all])))


(defentity QueryExecution
  [(table :query_queryexecution)
   (default-fields id uuid version json_query raw_query status started_at finished_at running_time error result_rows)
   (types :json_query :json, :result_data :json, :status :keyword)]

  (post-select [_ {:keys [result_rows] :as query-execution}]
    ;; sadly we have 2 ways to reference the row count :(
    (assoc query-execution
           :row_count (or result_rows 0))))
