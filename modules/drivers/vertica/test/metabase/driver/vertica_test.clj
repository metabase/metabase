(ns ^:mb/driver-tests metabase.driver.vertica-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.driver.vertica-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]))

(set! *warn-on-reflection* true)

(deftest db-timezone-test
  (mt/test-driver :vertica
    (is (= "UTC"
           (driver/db-default-timezone :vertica (mt/db))))))

(deftest ^:parallel additional-connection-string-options-test
  (testing "Make sure you can add additional connection string options (#6651)"
    (is (= {:classname        "com.vertica.jdbc.Driver"
            :subprotocol      "vertica"
            :subname          "//localhost:5433/birds-near-me?ConnectionLoadBalance=1"
            :disablecopylocal "true"}
           (sql-jdbc.conn/connection-details->spec :vertica {:host               "localhost"
                                                             :port               5433
                                                             :db                 "birds-near-me"
                                                             :additional-options "ConnectionLoadBalance=1"})))))

(deftest ^:parallel copy-local-is-disabled-test
  (testing "`COPY ... FROM LOCAL` reads files on the Metabase host into the warehouse, so it is always disabled"
    ;; the connection details pass detail keys through as connection properties and `:additional-options` into the
    ;; URL, and the client reads property names case-insensitively, so a user's value in any casing, either way in, is
    ;; dropped rather than left to compete with ours
    (doseq [details [{}
                     {:additional-options "DisableCopyLocal=false"}
                     {:additional-options "ConnectionLoadBalance=1&disablecopylocal=0"}
                     {:additional-options " DISABLECOPYLOCAL =false&ConnectionLoadBalance=1"}
                     {:DisableCopyLocal false}
                     {:disablecopylocal "false"}
                     {:DISABLECOPYLOCAL "0"}]]
      (testing (pr-str details)
        (let [spec (sql-jdbc.conn/connection-details->spec :vertica (merge {:host "localhost" :port 5433 :db "birds"}
                                                                           details))]
          (is (= "true" (:disablecopylocal spec)))
          (is (= [:disablecopylocal] (filterv #(re-find #"(?i)copylocal" (name %)) (keys spec))))
          (is (not (re-find #"(?i)copylocal" (:subname spec))))
          (testing "other options are kept"
            (when (re-find #"ConnectionLoadBalance" (str (:additional-options details)))
              (is (re-find #"ConnectionLoadBalance=1" (:subname spec))))))))))

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
        (is (= {:lib/type :mbql.stage/native
                :query  ["SELECT"
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

(deftest array-is-returned-correctly-test
  (mt/test-driver :vertica
    (is (= [[["a" "b" "c"]]]
           (->> (mt/native-query {:query (tx/native-array-query :vertica)})
                mt/process-query
                mt/rows)))))
