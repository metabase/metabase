(ns metabase.driver.generic-sql.native-test
  (:require [clojure.tools.logging :as log]
            [colorize.core :as color]
            [expectations :refer :all]
            [metabase.db :refer [ins cascade-delete]]
            [metabase.driver :as driver]
            [metabase.models.database :refer [Database]]
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
                         :database (id)}))

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
                         :database (id)}))

;; Check that we get proper error responses for malformed SQL
(expect {:status :failed
         :class  java.lang.Exception
         :error  "Column \"ZID\" not found"}
  (dissoc (driver/process-query {:native   {:query "SELECT ZID FROM CHECKINS LIMIT 2;"} ; make sure people know it's to be expected
                                 :type     :native
                                 :database (id)})
          :stacktrace
          :query
          :expanded-query))

;; Check that we're not allowed to run SQL against an H2 database with a non-admin account
(expect "Running SQL queries against H2 databases using the default (admin) database user is forbidden."
  ;; Insert a fake Database. It doesn't matter that it doesn't actually exist since query processing should
  ;; fail immediately when it realizes this DB doesn't have a USER
  (let [db (ins Database :name "Fake-H2-DB", :engine "h2", :details {:db "mem:fake-h2-db"})]
    (try (:error (driver/process-query {:database (:id db)
                                        :type     :native
                                        :native   {:query "SELECT 1;"}}))
         (finally (cascade-delete Database :name "Fake-H2-DB")))))
