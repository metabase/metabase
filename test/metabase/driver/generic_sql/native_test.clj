(ns metabase.driver.generic-sql.native-test
  (:require [expectations :refer :all]
            [metabase.driver.generic-sql.native :refer :all]
            [metabase.test-data :refer :all]))

;; Just check that a basic query works
(expect {:status :completed
         :row_count 2
         :data {:rows [[100]
                       [99]]
                :columns [:id]
                :cols [{:name :id, :base_type :IntegerField}]}}
  (process-and-run {:native {:query "SELECT ID FROM VENUES ORDER BY ID DESC LIMIT 2;"}
                    :database @db-id}))

;; Check that column ordering is maintained
(expect
    {:status :completed
     :row_count 2
     :data {:rows [[100 "Mohawk Bend" 46]
                   [99 "Golden Road Brewing" 10]]
            :columns [:id :name :category_id]
            :cols [{:name :id, :base_type :IntegerField}
                   {:name :name, :base_type :TextField}
                   {:name :category_id, :base_type :IntegerField}]}}
  (process-and-run {:native {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2;"}
                    :database @db-id}))

;; Check that we get proper error responses for malformed SQL
(expect {:status :failed
         :error "Column \"ZID\" not found"}
  (process-and-run {:native {:query "SELECT ZID FROM CHECKINS LIMIT 2;"}
                    :database @db-id}))
