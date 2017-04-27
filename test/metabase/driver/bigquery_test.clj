(ns metabase.driver.bigquery-test
  (:require [expectations :refer :all]
            [metabase
             [query-processor :as qp]
             [query-processor-test :as qptest]]
            [metabase.query-processor.expand :as ql]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :refer [expect-with-engine]]))

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

;; make sure that the bigquery driver can handle named columns with characters that aren't allowed in BQ itself
(expect-with-engine :bigquery
  {:rows    [[113]]
   :columns ["User_ID_Plus_Venue_ID"]}
  (qptest/rows+column-names
    (qp/process-query {:database (data/id)
                       :type     "query"
                       :query    {:source_table (data/id :checkins)
                                  :aggregation  [["named" ["max" ["+" ["field-id" (data/id :checkins :user_id)]
                                                                      ["field-id" (data/id :checkins :venue_id)]]]
                                                  "User ID Plus Venue ID"]]}})))

;; make sure BigQuery can handle two aggregations with the same name (#4089)
(tu/resolve-private-vars metabase.driver.bigquery
  deduplicate-aliases update-select-subclause-aliases)

(expect
  ["sum" "count" "sum_2" "avg" "sum_3" "min"]
  (deduplicate-aliases ["sum" "count" "sum" "avg" "sum" "min"]))

(expect
  ["sum" "count" "sum_2" "avg" "sum_2_2" "min"]
  (deduplicate-aliases ["sum" "count" "sum" "avg" "sum_2" "min"]))

(expect
  ["sum" "count" nil "sum_2"]
  (deduplicate-aliases ["sum" "count" nil "sum"]))

(expect
  [[:user_id "user_id_2"] :venue_id]
  (update-select-subclause-aliases [[:user_id "user_id"] :venue_id]
                                   ["user_id_2" nil]))


(expect-with-engine :bigquery
  {:rows [[7929 7929]], :columns ["sum" "sum_2"]}
  (qptest/rows+column-names
    (qp/process-query {:database (data/id)
                       :type     "query"
                       :query    (-> {}
                                     (ql/source-table (data/id :checkins))
                                     (ql/aggregation (ql/sum (ql/field-id (data/id :checkins :user_id)))
                                                     (ql/sum (ql/field-id (data/id :checkins :user_id)))))})))

(expect-with-engine :bigquery
  {:rows [[7929 7929 7929]], :columns ["sum" "sum_2" "sum_3"]}
  (qptest/rows+column-names
    (qp/process-query {:database (data/id)
                       :type     "query"
                       :query    (-> {}
                                     (ql/source-table (data/id :checkins))
                                     (ql/aggregation (ql/sum (ql/field-id (data/id :checkins :user_id)))
                                                     (ql/sum (ql/field-id (data/id :checkins :user_id)))
                                                     (ql/sum (ql/field-id (data/id :checkins :user_id)))))})))
