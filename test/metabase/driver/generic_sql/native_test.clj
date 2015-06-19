(ns metabase.driver.generic-sql.native-test
  (:require [clojure.tools.logging :as log]
            [colorize.core :as color]
            [expectations :refer :all]
            [metabase.driver :as driver]
            [metabase.test.data :refer :all]))

;; Just check that a basic query works
(expect {:status :completed
         :row_count 2
         :data {:rows [[100]
                       [99]]
                :columns [:id]
                :cols [{:name :id, :base_type :IntegerField}]}}
  (driver/process-query {:native   {:query "SELECT ID FROM VENUES ORDER BY ID DESC LIMIT 2;"}
                         :type     :native
                         :database (db-id)}))

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
  (driver/process-query {:native   {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2;"}
                         :type     :native
                         :database (db-id)}))

;; Check that we get proper error responses for malformed SQL
(expect {:status :failed
         :error "Column \"ZID\" not found"}
  (do (log/info (color/green "NOTE: The following stacktrace is expected <3"))      ; this will print a stacktrace
      (driver/process-query {:native   {:query "SELECT ZID FROM CHECKINS LIMIT 2;"} ; make sure people know it's to be expected
                             :type     :native
                             :database (db-id)})))
