(ns metabase.driver.vertica-test
  (:require [clojure.test :refer :all]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.test.util :as tu]))

(deftest db-timezone-test
  (mt/test-driver :vertica
    (is (= "UTC" (tu/db-timezone-id)))))

(deftest additional-connection-string-options-test
  (mt/test-driver :vertica
    (testing "Make sure you can add additional connection string options (#6651)"
      (is (= {:classname   "com.vertica.jdbc.Driver"
              :subprotocol "vertica"
              :subname     "//localhost:5433/birds-near-me?ConnectionLoadBalance=1"}
             (sql-jdbc.conn/connection-details->spec :vertica {:host               "localhost"
                                                               :port               5433
                                                               :db                 "birds-near-me"
                                                               :additional-options "ConnectionLoadBalance=1"}))))))

(deftest dots-in-column-names-test
  (mt/test-driver :vertica
    (testing "Columns with dots in the name should be properly quoted (#13932)"
      (mt/dataset dots-in-names
        (is (= {:query  (str "SELECT * "
                             "FROM table "
                             "WHERE \"public\".\"dots_in_names_objects.stuff\".\"dotted.name\" = ?")
                :params ["ouija_board"]}
               (qp/compile
                {:database   (mt/id)
                 :type       :native
                 :native     {:query         "SELECT * FROM table WHERE {{x}}"
                              :template-tags {"x" {:name         "x"
                                                   :display-name "X"
                                                   :type         :dimension
                                                   :dimension    [:field (mt/id :objects.stuff :dotted.name) nil]
                                                   :widget-type  :text}}}
                 :parameters [{:type   :text
                               :target [:dimension [:template-tag "x"]]
                               :value  "ouija_board"}]})))))))
