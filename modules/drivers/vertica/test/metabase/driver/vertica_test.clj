(ns metabase.driver.vertica-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest db-timezone-test
  (mt/test-driver :vertica
    (is (= "UTC"
           (driver/db-default-timezone :vertica (mt/db))))))

(deftest ^:parallel additional-connection-string-options-test
  (testing "Make sure you can add additional connection string options (#6651)"
    (is (= {:classname   "com.vertica.jdbc.Driver"
            :subprotocol "vertica"
            :subname     "//localhost:5433/birds-near-me?ConnectionLoadBalance=1"}
           (sql-jdbc.conn/connection-details->spec :vertica {:host               "localhost"
                                                             :port               5433
                                                             :db                 "birds-near-me"
                                                             :additional-options "ConnectionLoadBalance=1"})))))

(defn- compile-query [query]
  (-> (qp.compile/compile query)
      (update :query #(str/split-lines (driver/prettify-native-form :vertica %)))))

(deftest ^:parallel percentile-test
  (mt/test-driver :vertica
    (is (= {:query  ["SELECT"
                     "  APPROXIMATE_PERCENTILE("
                     "    \"public\".\"test_data_venues\".\"id\" USING PARAMETERS percentile = 1"
                     "  ) AS \"percentile\""
                     "FROM"
                     "  \"public\".\"test_data_venues\""]
            :params nil}
           (compile-query
            (mt/mbql-query venues
              {:aggregation [[:percentile $id 1]]}))))))

(deftest ^:parallel dots-in-column-names-test
  (mt/test-driver :vertica
    (testing "Columns with dots in the name should be properly quoted (#13932)"
      (mt/dataset dots-in-names
        (is (= {:query  ["SELECT"
                         "  *"
                         "FROM"
                         "  table"
                         "WHERE"
                         "  \"public\".\"dots_in_names_objects.stuff\".\"dotted.name\" = ?"]
                :params ["ouija_board"]}
               (compile-query
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
