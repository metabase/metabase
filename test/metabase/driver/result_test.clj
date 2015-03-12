(ns metabase.driver.result-test
  (:require [clojure.data.json :as json]
            [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.result :as result]
            (metabase.models [query :refer [Query]]
                             [query-execution :refer [QueryExecution]])
            [metabase.test-data :refer [db-id user->id]]
            [metabase.test.util :refer [match-$ random-name expect-eval-actual-first]]
            [metabase.util :as util]))


; insert a Query with a QueryExecution
(let [addtl-info (random-name)]
  (expect-eval-actual-first
    (match-$ (sel :one QueryExecution :additional_info addtl-info)
      {:id $
       :uuid $
       :status "completed"
       :row_count 1
       :data {:rows [[100]]
              :columns ["count"]
              :cols [{:base_type "IntegerField"
                      :special_type "number"
                      :name "count"
                      :id nil
                      :table_id nil
                      :description nil}]}})
    (let [{query-id :id} (ins Query
                           :type "rawsql"
                           :name (random-name)
                           :details {:sql "select 100"}
                           :creator_id (user->id :rasta)
                           :public_perms 0
                           :database_id @db-id)]
      ;; Add a dummy QueryExecution for our Query so that we have something to pull the cached result from
      (ins QueryExecution
        :uuid (.toString (java.util.UUID/randomUUID))
        :executor_id (user->id :rasta)
        :json_query {}
        :query_id query-id
        :version 1
        :status "completed"
        :error ""
        :started_at (util/new-sql-timestamp)
        :finished_at (util/new-sql-timestamp)
        :running_time 0
        :result_rows 1
        :result_file ""
        :result_data (json/write-str {:rows [[100]]
                                      :cols [{:base_type "IntegerField"
                                              :special_type "number"
                                              :name "count"
                                              :id nil
                                              :table_id nil
                                              :description nil}]
                                      :columns ["count"]})
        :raw_query ""
        :additional_info addtl-info)
      (result/process-and-run {:type :result
                               :database @db-id
                               :result {:query_id query-id}}))))
