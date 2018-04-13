(ns metabase.driver.generic-sql.native-test
  (:require [expectations :refer :all]
            [medley.core :as m]
            [metabase.models.database :refer [Database]]
            [metabase.query-processor :as qp]
            [metabase.test.data :refer :all]
            [toucan.db :as db]))

(def ^:private col-defaults
  {:remapped_from nil, :remapped_to nil})

;; Just check that a basic query works
(expect
  {:status    :completed
   :row_count 2
   :data      {:rows        [[100]
                             [99]]
               :columns     ["ID"]
               :cols        [(merge col-defaults {:name "ID", :display_name "ID", :base_type :type/Integer})]
               :native_form {:query "SELECT ID FROM VENUES ORDER BY ID DESC LIMIT 2", :params []}}}
  (-> (qp/process-query {:native   {:query "SELECT ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                         :type     :native
                         :database (id)})
      (m/dissoc-in [:data :results_metadata])))

;; Check that column ordering is maintained
(expect
  {:status    :completed
   :row_count 2
   :data      {:rows        [[100 "Mohawk Bend" 46]
                             [99 "Golden Road Brewing" 10]]
               :columns     ["ID" "NAME" "CATEGORY_ID"]
               :cols        (mapv #(merge col-defaults %)
                                  [{:name "ID",          :display_name "ID",          :base_type :type/Integer}
                                   {:name "NAME",        :display_name "Name",        :base_type :type/Text}
                                   {:name "CATEGORY_ID", :display_name "Category ID", :base_type :type/Integer}])
               :native_form {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2", :params []}}}
  (-> (qp/process-query {:native   {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                         :type     :native
                         :database (id)})
      (m/dissoc-in [:data :results_metadata])))

;; Check that we get proper error responses for malformed SQL
(expect {:status :failed
         :class  java.lang.Exception
         :error  "Column \"ZID\" not found"}
  (dissoc (qp/process-query {:native   {:query "SELECT ZID FROM CHECKINS LIMIT 2"} ; make sure people know it's to be expected
                             :type     :native
                             :database (id)})
          :stacktrace
          :query
          :expanded-query))

;; Check that we're not allowed to run SQL against an H2 database with a non-admin account
(expect "Running SQL queries against H2 databases using the default (admin) database user is forbidden."
  ;; Insert a fake Database. It doesn't matter that it doesn't actually exist since query processing should
  ;; fail immediately when it realizes this DB doesn't have a USER
  (let [db (db/insert! Database, :name "Fake-H2-DB", :engine "h2", :details {:db "mem:fake-h2-db"})]
    (try (:error (qp/process-query {:database (:id db)
                                    :type     :native
                                    :native   {:query "SELECT 1"}}))
         (finally (db/delete! Database :name "Fake-H2-DB")))))
