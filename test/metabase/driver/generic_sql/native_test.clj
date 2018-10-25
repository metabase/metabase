(ns metabase.driver.generic-sql.native-test
  "Tests for running native queries against SQL databases."
  (:require [expectations :refer :all]
            [medley.core :as m]
            [metabase.query-processor :as qp]
            [metabase.test.data :as data]
            [metabase.test.util.log :as tu.log]))

;; Just check that a basic query works
(expect
  {:status    :completed
   :row_count 2
   :data      {:rows        [[100]
                             [99]]
               :columns     ["ID"]
               :cols        [{:name "ID", :display_name "ID", :base_type :type/Integer, :source :native}]
               :native_form {:query "SELECT ID FROM VENUES ORDER BY ID DESC LIMIT 2", :params []}}}
  (-> (qp/process-query {:native   {:query "SELECT ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                         :type     :native
                         :database (data/id)})
      (m/dissoc-in [:data :results_metadata])
      (m/dissoc-in [:data :insights])))

;; Check that column ordering is maintained
(expect
  {:status    :completed
   :row_count 2
   :data      {:rows        [[100 "Mohawk Bend" 46]
                             [99 "Golden Road Brewing" 10]]
               :columns     ["ID" "NAME" "CATEGORY_ID"]
               :cols        [{:name "ID",          :display_name "ID",          :source :native, :base_type :type/Integer}
                             {:name "NAME",        :display_name "Name",        :source :native, :base_type :type/Text}
                             {:name "CATEGORY_ID", :display_name "Category ID", :source :native, :base_type :type/Integer}]
               :native_form {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2", :params []}}}
  (-> (qp/process-query {:native   {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                         :type     :native
                         :database (data/id)})
      (m/dissoc-in [:data :results_metadata])
      (m/dissoc-in [:data :insights])))

;; Check that we get proper error responses for malformed SQL
(expect
  {:status :failed
   :class  java.lang.Exception
   :error  "Column \"ZID\" not found"}
  (dissoc (tu.log/suppress-output
            (qp/process-query {:native   {:query "SELECT ZID FROM CHECKINS LIMIT 2"}
                               :type     :native
                               :database (data/id)}))
          :stacktrace
          :query))
