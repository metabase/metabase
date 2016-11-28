(ns metabase.driver.bigquery-test
  (:require metabase.driver.bigquery
            [metabase.models.database :as database]
            [metabase.query-processor :as qp]
            [metabase.test.data :as data]
            (metabase.test.data [datasets :refer [expect-with-engine]]
                                [interface :refer [def-database-definition]])))


;; Test native queries
(expect-with-engine :bigquery
  [[100]
   [99]]
  (get-in (qp/process-query {:native   {:query "SELECT [test_data.venues.id] FROM [test_data.venues] ORDER BY [test_data.venues.id] DESC LIMIT 2;"}
                             :type     :native
                             :database (data/id)})
          [:data :rows]))


;; make sure that BigQuery native queries maintain the column ordering specified in the SQL -- post-processing ordering shouldn't apply (Issue #2821)
(expect-with-engine :bigquery
  {:columns ["venue_id" "user_id" "checkins_id"]
   :cols    [{:name "venue_id",    :base_type :type/Integer}
             {:name "user_id",     :base_type :type/Integer}
             {:name "checkins_id", :base_type :type/Integer}]}
  (select-keys (:data (qp/process-query {:native   {:query "SELECT [test_data.checkins.venue_id] AS [venue_id], [test_data.checkins.user_id] AS [user_id], [test_data.checkins.id] AS [checkins_id]
                                                            FROM [test_data.checkins]
                                                            LIMIT 2"}
                                         :type     :native
                                         :database (data/id)}))
               [:cols :columns]))
