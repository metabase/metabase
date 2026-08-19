(ns ^:mb/driver-tests metabase.driver.vertica-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.honey-sql-2 :as h2x]))

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

(deftest ^:parallel convert-timezone-escapes-hostile-zone-string-test
  (testing "Vertica splices :convert-timezone's zone string into SQL as an inline literal --
            it must escape every zone string correctly, regardless of whether it's attacker-shaped"
    (doseq [zone ["Z\\' AT TIME ZONE 'UTC"    ; the PoC
                  "'  AT TIME ZONE 'UTC"
                  "''  AT TIME ZONE 'UTC"
                  "'''  AT TIME ZONE 'UTC"
                  "\\'  AT TIME ZONE 'UTC"
                  "UTC'  AT TIME ZONE 'UTC"
                  "O'Brien's Zone"]]         ; non-malicious: just a string with apostrophes in it
      (testing (str "zone = " (pr-str zone))
        (let [[sql-str] (sql/format-expr
                         (h2x/unwrap-typed-honeysql-form
                          (sql.qp/->honeysql :vertica [:convert-timezone :mock_expr zone "UTC"])))
              ;; every ' in a correctly-escaped SQL literal is doubled -- search for the zone string
              ;; escaped this way, as a literal (not regex) substring, via Pattern/quote.
              correctly-escaped (str/replace zone "'" "''")
              pattern           (re-pattern (str "'" (java.util.regex.Pattern/quote correctly-escaped) "'"))]
          (is (re-find pattern sql-str)
              (str "the correctly-escaped zone literal ('" correctly-escaped "') does not appear in the "
                   "compiled SQL -- the zone string was not escaped correctly. Compiled: " (pr-str sql-str))))))))

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
