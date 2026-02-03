(ns ^:mb/driver-tests metabase.driver.sqlserver-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [colorize.core :as colorize]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common :as driver.common]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sqlserver :as sqlserver]
   [metabase.lib.core :as lib]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.limit :as limit]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.test :as mt]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [next.jdbc]))

(set! *warn-on-reflection* true)

(deftest ^:parallel fix-order-bys-test
  (testing "Remove order-by from joins"
    (let [original {:joins [{:alias        "C3"
                             :source-query {:source-table 1
                                            :order-by     [[:asc [:field 2 nil]]]}}
                            {:alias        "C4"
                             :source-query {:source-table 1
                                            :order-by     [[:asc [:field 2 nil]]]
                                            :limit        10}}]}
          expected {:joins [{:alias        "C3"
                             :source-query {:source-table 1}}
                            {:alias        "C4"
                             :source-query {:source-table 1
                                            :order-by     [[:asc [:field 2 nil]]]
                                            :limit        10}}]}]
      (is (= expected
             (#'sqlserver/fix-order-bys original)))
      (testing "Inside `:source-query`"
        (is (= {:source-query expected}
               (#'sqlserver/fix-order-bys {:source-query original})))))))

(deftest ^:parallel fix-order-bys-test-2
  (testing "Add limit for :source-query order bys"
    (mt/$ids nil
      (let [original {:source-table 1
                      :order-by     [[:asc 2]]}]
        (testing "Not in a source query -- don't do anything"
          (is (= original
                 (#'sqlserver/fix-order-bys original))))
        (testing "In source query -- add `:limit`"
          (is (= {:source-query (assoc original :limit limit/absolute-max-results)}
                 (#'sqlserver/fix-order-bys {:source-query original}))))
        (testing "In source query in source query-- add `:limit` at both levels"
          (is (= {:source-query {:source-query (assoc original :limit limit/absolute-max-results)
                                 :order-by     [[:asc [:field 1]]]
                                 :limit        limit/absolute-max-results}}
                 (#'sqlserver/fix-order-bys {:source-query {:source-query original
                                                            :order-by     [[:asc [:field 1]]]}}))))
        (testing "In source query inside source query for join -- add `:limit`"
          (is (= {:joins [{:source-query {:source-query (assoc original :limit limit/absolute-max-results)}}]}
                 (#'sqlserver/fix-order-bys
                  {:joins [{:source-query {:source-query original}}]}))))))))

;;; -------------------------------------------------- VARCHAR(MAX) --------------------------------------------------

(defn- a-gene
  "Really long string representing a gene like \"GGAGCACCTCCACAAGTGCAGGCTATCCTGTCGAGTAAGGCCT...\""
  []
  (apply str (repeatedly 1000 (partial rand-nth [\A \G \C \T]))))

(mt/defdataset ^:private genetic-data
  [["genetic-data"
    [{:field-name "gene", :base-type {:native "VARCHAR(MAX)"}, :effective-type :type/Text}]
    [[(a-gene)]]]])

(deftest ^:parallel clobs-should-come-back-as-text-test
  (mt/test-driver :sqlserver
    (testing "Make sure something long doesn't come back as some weird type like `ClobImpl`"
      (is (= [[1 (-> genetic-data :table-definitions first :rows ffirst)]]
             (-> (mt/dataset genetic-data (mt/run-mbql-query genetic-data))
                 mt/rows
                 mt/obj->json->obj)))))) ; convert to JSON + back so the Clob gets stringified

(deftest ^:parallel connection-spec-test
  (testing "Test that additional connection string options work (#5296)"
    (is (= {:applicationName    (format
                                 "Metabase %s [%s]"
                                 (or (:tag config/mb-version-info) "")
                                 config/local-process-uuid)
            :database           "birddb"
            :encrypt            false
            :instanceName       nil
            :loginTimeout       10
            :password           "toucans"
            :port               1433
            :sendTimeAsDatetime false
            :subname            "//localhost;trustServerCertificate=false"
            :subprotocol        "sqlserver"
            :user               "cam"}
           (sql-jdbc.conn/connection-details->spec :sqlserver
                                                   {:user               "cam"
                                                    :password           "toucans"
                                                    :db                 "birddb"
                                                    :host               "localhost"
                                                    :port               1433
                                                    :additional-options "trustServerCertificate=false"})))))

(deftest ^:parallel add-max-results-limit-test
  (mt/test-driver :sqlserver
    (testing (str "SQL Server doesn't let you use ORDER BY in nested SELECTs unless you also specify a TOP (their "
                  "equivalent of LIMIT). Make sure we add a max-results LIMIT to the nested query")
      (is (= {:query ["SELECT"
                      "  TOP(1048575) \"source\".\"name\" AS \"name\""
                      "FROM"
                      "  ("
                      "    SELECT"
                      "      TOP(1048575) \"dbo\".\"venues\".\"name\" AS \"name\""
                      "    FROM"
                      "      \"dbo\".\"venues\""
                      "    ORDER BY"
                      "      \"dbo\".\"venues\".\"id\" ASC"
                      "  ) AS \"source\""]
              :params nil}
             (-> (mt/mbql-query venues
                   {:source-query {:source-table $$venues
                                   :fields       [$name]
                                   :order-by     [[:asc $id]]}})
                 qp.compile/compile
                 (update :query #(str/split-lines (driver/prettify-native-form :sqlserver %)))))))))

(deftest ^:parallel preserve-existing-top-clauses
  (mt/test-driver :sqlserver
    (testing (str "make sure when adding TOP clauses to make ORDER BY work we don't stomp over any explicit TOP "
                  "clauses that may have been set in the query")
      (is (= {:query  ["SELECT"
                       "  TOP(10) \"source\".\"name\" AS \"name\""
                       "FROM"
                       "  ("
                       "    SELECT"
                       "      TOP(20) \"dbo\".\"venues\".\"name\" AS \"name\""
                       "    FROM"
                       "      \"dbo\".\"venues\""
                       "    ORDER BY"
                       "      \"dbo\".\"venues\".\"id\" ASC"
                       "  ) AS \"source\""]
              :params nil}
             (-> (qp.compile/compile
                  (mt/mbql-query venues
                    {:source-query {:source-table $$venues
                                    :fields       [$name]
                                    :order-by     [[:asc $id]]
                                    :limit        20}
                     :limit        10}))
                 (update :query #(str/split-lines (driver/prettify-native-form :sqlserver %)))))))))

(deftest ^:parallel dont-add-top-clauses-for-top-level-test
  (mt/test-driver :sqlserver
    (testing (str "We don't need to add TOP clauses for top-level order by. Normally we always add one anyway because "
                  "of the max-results stuff, but make sure our impl doesn't add one when it's not in the source MBQL"))
    ;; in order to actually see how things would work without the implicit max-results limit added we'll preprocess
    ;; the query, strip off the `:limit` that got added, and then feed it back to the QP where we left off
    (let [preprocessed (-> (mt/mbql-query venues
                             {:source-query {:source-table $$venues
                                             :fields       [$name]
                                             :order-by     [[:asc $id]]}
                              :order-by     [[:asc $id]]})
                           qp.preprocess/preprocess
                           (lib/limit nil))]
      (mt/with-metadata-provider (mt/id)
        (is (= {:query  ["SELECT"
                         "  \"source\".\"name\" AS \"name\""
                         "FROM"
                         "  ("
                         "    SELECT"
                         "      TOP(1048575) \"dbo\".\"venues\".\"name\" AS \"name\""
                         "    FROM"
                         "      \"dbo\".\"venues\""
                         "    ORDER BY"
                         "      \"dbo\".\"venues\".\"id\" ASC"
                         "  ) AS \"source\""
                         "ORDER BY"
                         "  \"source\".\"id\" ASC"]
                :params nil}
               (-> (driver/mbql->native :sqlserver preprocessed)
                   (update :query (fn [sql]
                                    (str/split-lines (driver/prettify-native-form :sqlserver sql)))))))))))

(deftest ^:parallel max-results-should-actually-work-test
  (mt/test-driver :sqlserver
    (testing "ok, generating all that SQL above is nice, but let's make sure our queries actually work!"
      (is (= [["Red Medicine"]
              ["Stout Burgers & Beers"]
              ["The Apple Pan"]]
             (mt/rows
              (qp/process-query
               (mt/mbql-query venues
                 {:source-query {:source-table $$venues
                                 :fields       [$name]
                                 :order-by     [[:asc $id]]
                                 :limit        5}
                  :limit        3}))))))))

(deftest ^:parallel locale-bucketing-test
  (mt/test-driver :sqlserver
    (testing (str "Make sure datetime bucketing functions work properly with languages that format dates like "
                  "yyyy-dd-MM instead of yyyy-MM-dd (i.e. not American English) (#9057)")
      ;; we're doing things here with low-level calls to HoneySQL (emulating what the QP does) instead of using normal
      ;; QP pathways because `SET LANGUAGE` doesn't seem to persist to subsequent executions so to test that things
      ;; are working we need to add to in from of the query we're trying to check
      (sql-jdbc.execute/do-with-connection-with-options
       :sqlserver
       (mt/db)
       {:session-timezone (qp.timezone/report-timezone-id-if-supported :sqlserver (mt/db))}
       (fn [^java.sql.Connection conn]
         (.setAutoCommit conn false)
         (try
           (doseq [[sql & params] [["DROP TABLE IF EXISTS temp;"]
                                   ["CREATE TABLE temp (d DATETIME2);"]
                                   ["INSERT INTO temp (d) VALUES (?)" #t "2019-02-08T00:00:00Z"]
                                   ["SET LANGUAGE Italian;"]]]
             (with-open [stmt (sql-jdbc.execute/prepared-statement :sqlserver conn sql params)]
               (.execute stmt)))
           (let [[sql & params] (sql/format {:select [[(sql.qp/date :sqlserver :month :temp.d) :my-date]]
                                             :from   [:temp]}
                                            :dialect :ansi, :allow-dashed-names? true)]
             (with-open [stmt (sql-jdbc.execute/prepared-statement :sqlserver conn sql params)
                         rs   (sql-jdbc.execute/execute-prepared-statement! :sqlserver stmt)]
               (let [row-thunk (sql-jdbc.execute/row-thunk :sqlserver rs (.getMetaData rs))]
                 (is (= [#t "2019-02-01T00:00:00"]
                        (row-thunk))))))
           ;; rollback transaction so `temp` table gets discarded
           (finally
             (.rollback conn))))))))

(deftest ^:parallel locale-week-test
  (mt/test-driver :sqlserver
    (testing "Make sure aggregating by week starts weeks on the appropriate day regardless of the value of DATEFIRST"
      ;; we're manually sending sql to the database instead of using process-query because setting DATEFIRST doesn't
      ;; persist otherwise
      (sql-jdbc.execute/do-with-connection-with-options
       :sqlserver
       (mt/db)
       {:session-timezone (qp.timezone/report-timezone-id-if-supported :sqlserver (mt/db))}
       (fn [^java.sql.Connection conn]
         (doseq [datefirst (range 1 8)]
           (binding [driver.common/*start-of-week* :sunday]
             (let [{:keys [query params]} (qp.compile/compile (mt/mbql-query users
                                                                {:aggregation [["count"]]
                                                                 :breakout [!week.last_login]
                                                                 :filter [:= $name "Plato Yeshua"]}))
                   sql (format "SET DATEFIRST %d; %s" datefirst query)]
               (with-open [stmt (sql-jdbc.execute/prepared-statement :sqlserver conn sql params)
                           rs   (sql-jdbc.execute/execute-prepared-statement! :sqlserver stmt)]
                 (let [row-thunk (sql-jdbc.execute/row-thunk :sqlserver rs (.getMetaData rs))
                       row (row-thunk)]
                   (is (= [#t "2014-03-30T00:00" 1]
                          row))))))))))))

(deftest ^:parallel locale-day-of-week-test
  (mt/test-driver :sqlserver
    (testing "Make sure aggregating by day of week starts weeks on the appropriate day regardless of the value of
    DATEFIRST"
      ;; we're manually sending sql to the database instead of using process-query because setting DATEFIRST doesn't
      ;; persist otherwise
      (sql-jdbc.execute/do-with-connection-with-options
       :sqlserver
       (mt/db)
       {:session-timezone (qp.timezone/report-timezone-id-if-supported :sqlserver (mt/db))}
       (fn [^java.sql.Connection conn]
         (doseq [datefirst (range 1 8)]
           (binding [driver.common/*start-of-week* :sunday]
             (let [{:keys [query params]} (qp.compile/compile (mt/mbql-query users
                                                                {:aggregation [["count"]]
                                                                 :breakout [!day-of-week.last_login]
                                                                 :filter [:= $name "Plato Yeshua"]}))
                   sql (format "SET DATEFIRST %d; %s" datefirst query)]
               (with-open [stmt (sql-jdbc.execute/prepared-statement :sqlserver conn sql params)
                           rs   (sql-jdbc.execute/execute-prepared-statement! :sqlserver stmt)]
                 (let [row-thunk (sql-jdbc.execute/row-thunk :sqlserver rs (.getMetaData rs))
                       row (row-thunk)]
                   (is (= [3 1]
                          row))))))))))))

(deftest ^:parallel inline-value-test
  (mt/test-driver :sqlserver
    (let [date (t/local-date 2019 11 5)
          time (t/local-time 19 27)]
      ;; various types should come out the same as they went in (1 value per tuple) or something functionally
      ;; equivalent (2 values)
      (doseq [[t expected] [[date]
                            [time]
                            [(t/local-date-time date time)]
                            ;; SQL server doesn't support OffsetTime, so we should convert it to UTC and then to a
                            ;; LocalTime (?)
                            [(t/offset-time time (t/zone-offset -8)) (t/local-time 3 27)]
                            [(t/offset-date-time (t/local-date-time date time) (t/zone-offset -8))]
                            ;; since SQL Server doesn't support timezone IDs it should be converted to an offset in
                            ;; the literal
                            [(t/zoned-date-time  date time (t/zone-id "America/Los_Angeles"))
                             (t/offset-date-time (t/local-date-time date time) (t/zone-offset -8))]]]
        (let [expected (or expected t)]
          #_{:clj-kondo/ignore [:discouraged-var]}
          (testing (format "Convert %s to SQL literal" (colorize/magenta (with-out-str (pr t))))
            (let [sql (format "SELECT %s AS t;" (sql.qp/inline-value :sqlserver t))]
              (sql-jdbc.execute/do-with-connection-with-options
               :sqlserver
               (mt/db)
               nil
               (fn [^java.sql.Connection conn]
                 (with-open [stmt (sql-jdbc.execute/prepared-statement :sqlserver conn sql nil)
                             rs   (sql-jdbc.execute/execute-prepared-statement! :sqlserver stmt)]
                   (let [row-thunk (sql-jdbc.execute/row-thunk :sqlserver rs (.getMetaData rs))]
                     (is (= [expected]
                            (row-thunk))
                         (format "SQL %s should return %s" (colorize/blue (pr-str sql)) (colorize/green expected))))))))))))))

(defn- pretty-sql [s]
  (as-> s s
    (str/replace s #"\"" "")
    (driver/prettify-native-form :sqlserver s)
    (str/split-lines s)))

(deftest ^:parallel optimal-filter-clauses-test
  (mt/test-driver :sqlserver
    (testing "Should use efficient functions like year() for date bucketing (#9934)"
      (letfn [(query-with-bucketing [unit]
                (mt/mbql-query checkins
                  {:aggregation [[:count]]
                   :breakout    [[:field $date {:temporal-unit unit}]]}))]
        (doseq [[unit {:keys [expected-sql expected-rows]}]
                {"year"
                 {:expected-sql
                  ["SELECT"
                   "  DATEFROMPARTS(YEAR(dbo.checkins.date), 1, 1) AS date,"
                   "  COUNT(*) AS count"
                   "FROM"
                   "  dbo.checkins"
                   "GROUP BY"
                   "  YEAR(dbo.checkins.date)"
                   "ORDER BY"
                   "  YEAR(dbo.checkins.date) ASC"]

                  :expected-rows
                  [["2013-01-01T00:00:00Z" 235]
                   ["2014-01-01T00:00:00Z" 498]
                   ["2015-01-01T00:00:00Z" 267]]}

                 "month"
                 {:expected-sql
                  ["SELECT"
                   "  DATEFROMPARTS("
                   "    YEAR(dbo.checkins.date),"
                   "    MONTH(dbo.checkins.date),"
                   "    1"
                   "  ) AS date,"
                   "  COUNT(*) AS count"
                   "FROM"
                   "  dbo.checkins"
                   "GROUP BY"
                   "  YEAR(dbo.checkins.date),"
                   "  MONTH(dbo.checkins.date)"
                   "ORDER BY"
                   "  YEAR(dbo.checkins.date) ASC,"
                   "  MONTH(dbo.checkins.date) ASC"]

                  :expected-rows
                  [["2013-01-01T00:00:00Z" 8]
                   ["2013-02-01T00:00:00Z" 11]
                   ["2013-03-01T00:00:00Z" 21]
                   ["2013-04-01T00:00:00Z" 26]
                   ["2013-05-01T00:00:00Z" 23]]}

                 "day"
                 {:expected-sql
                  ["SELECT"
                   "  DATEFROMPARTS("
                   "    YEAR(dbo.checkins.date),"
                   "    MONTH(dbo.checkins.date),"
                   "    DAY(dbo.checkins.date)"
                   "  ) AS date,"
                   "  COUNT(*) AS count"
                   "FROM"
                   "  dbo.checkins"
                   "GROUP BY"
                   "  YEAR(dbo.checkins.date),"
                   "  MONTH(dbo.checkins.date),"
                   "  DAY(dbo.checkins.date)"
                   "ORDER BY"
                   "  YEAR(dbo.checkins.date) ASC,"
                   "  MONTH(dbo.checkins.date) ASC,"
                   "  DAY(dbo.checkins.date) ASC"]

                  :expected-rows
                  [["2013-01-03T00:00:00Z" 1]
                   ["2013-01-10T00:00:00Z" 1]
                   ["2013-01-19T00:00:00Z" 1]
                   ["2013-01-22T00:00:00Z" 1]
                   ["2013-01-23T00:00:00Z" 1]]}}]
          (testing (format "\nUnit = %s\n" unit)
            (testing "Should generate the correct SQL query"
              (is (= expected-sql
                     (pretty-sql (:query (qp.compile/compile (query-with-bucketing unit)))))))
            (testing "Should still return correct results"
              (is (= expected-rows
                     (take 5 (mt/rows
                              (mt/run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :breakout    [[:field $date {:temporal-unit unit}]]})))))
              (is (= [:type/Date :type/Integer]
                     (->> {:aggregation [[:count]]
                           :breakout    [[:field $date {:temporal-unit unit}]]}
                          (mt/run-mbql-query checkins)
                          :data
                          :results_metadata
                          :columns
                          (map :base_type)))))))))))

(deftest ^:parallel truncated-datetime-still-datetime-test
  (mt/test-driver :sqlserver
    (testing "When truncating a `:type/DateTime` to a date-sized unit, return datetime"
      (letfn [(query-with-bucketing [unit]
                (mt/mbql-query orders
                  {:aggregation [[:count]]
                   :breakout    [[:field $created_at {:temporal-unit unit}]]}))]
        (doseq [[unit {:keys [expected-sql expected-rows]}]
                {"year"
                 {:expected-sql
                  ["SELECT"
                   "  CAST("
                   "    DATEFROMPARTS(YEAR(dbo.orders.created_at), 1, 1) AS datetime2"
                   "  ) AS created_at,"
                   "  COUNT(*) AS count"
                   "FROM"
                   "  dbo.orders"
                   "GROUP BY"
                   "  YEAR(dbo.orders.created_at)"
                   "ORDER BY"
                   "  YEAR(dbo.orders.created_at) ASC"]

                  :expected-rows
                  [["2013-01-01T00:00:00Z" 235]
                   ["2014-01-01T00:00:00Z" 498]
                   ["2015-01-01T00:00:00Z" 267]]}

                 "month"
                 {:expected-sql
                  ["SELECT"
                   "  CAST("
                   "    DATEFROMPARTS("
                   "      YEAR(dbo.orders.created_at),"
                   "      MONTH(dbo.orders.created_at),"
                   "      1"
                   "    ) AS datetime2"
                   "  ) AS created_at,"
                   "  COUNT(*) AS count"
                   "FROM"
                   "  dbo.orders"
                   "GROUP BY"
                   "  YEAR(dbo.orders.created_at),"
                   "  MONTH(dbo.orders.created_at)"
                   "ORDER BY"
                   "  YEAR(dbo.orders.created_at) ASC,"
                   "  MONTH(dbo.orders.created_at) ASC"]

                  :expected-rows
                  [["2013-01-01T00:00:00Z" 8]
                   ["2013-02-01T00:00:00Z" 11]
                   ["2013-03-01T00:00:00Z" 21]
                   ["2013-04-01T00:00:00Z" 26]
                   ["2013-05-01T00:00:00Z" 23]]}

                 "day"
                 {:expected-sql
                  ["SELECT"
                   "  CAST("
                   "    DATEFROMPARTS("
                   "      YEAR(dbo.orders.created_at),"
                   "      MONTH(dbo.orders.created_at),"
                   "      DAY(dbo.orders.created_at)"
                   "    ) AS datetime2"
                   "  ) AS created_at,"
                   "  COUNT(*) AS count"
                   "FROM"
                   "  dbo.orders"
                   "GROUP BY"
                   "  YEAR(dbo.orders.created_at),"
                   "  MONTH(dbo.orders.created_at),"
                   "  DAY(dbo.orders.created_at)"
                   "ORDER BY"
                   "  YEAR(dbo.orders.created_at) ASC,"
                   "  MONTH(dbo.orders.created_at) ASC,"
                   "  DAY(dbo.orders.created_at) ASC"]

                  :expected-rows
                  [["2013-01-03T00:00:00Z" 1]
                   ["2013-01-10T00:00:00Z" 1]
                   ["2013-01-19T00:00:00Z" 1]
                   ["2013-01-22T00:00:00Z" 1]
                   ["2013-01-23T00:00:00Z" 1]]}}]
          (testing (format "\nUnit = %s\n" unit)
            (testing "Should generate the correct SQL query"
              (is (= expected-sql
                     (pretty-sql (:query (qp.compile/compile (query-with-bucketing unit)))))))
            (testing "Should still return correct results"
              (is (= expected-rows
                     (take 5 (mt/rows
                              (mt/run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :breakout    [[:field $date {:temporal-unit unit}]]})))))
              (is (= [:type/DateTime :type/Integer]
                     (->> {:aggregation [[:count]]
                           :breakout    [[:field $created_at {:temporal-unit unit}]]}
                          (mt/run-mbql-query orders)
                          :data
                          :results_metadata
                          :columns
                          (map :base_type)))))))))))

(deftest ^:parallel top-level-boolean-expressions-test
  (mt/test-driver :sqlserver
    (testing "BIT values like 0 and 1 get converted to equivalent boolean expressions"
      (let [true-value  [:value true {:base_type :type/Boolean}]
            false-value [:value false {:base_type :type/Boolean}]]
        (letfn [(orders-query [args]
                  (-> (mt/mbql-query orders
                        {:expressions {"MyTrue"  true-value
                                       "MyFalse" false-value}
                         :fields      [[:expression "MyTrue"]]
                         :limit       1})
                      (update :query merge args)))]
          (doseq [{:keys [desc query expected-sql expected-types expected-rows]}
                  [{:desc "true filter"
                    :query
                    (orders-query {:filter true-value})
                    :expected-sql
                    ["SELECT"
                     "  TOP(1) CAST(1 AS bit) AS MyTrue"
                     "FROM"
                     "  dbo.orders"
                     "WHERE"
                     "  1 = 1"]
                    :expected-types [:type/Boolean]
                    :expected-rows  [[true]]}
                   {:desc "false filter"
                    :query
                    (orders-query {:filter false-value})
                    :expected-sql
                    ["SELECT"
                     "  TOP(1) CAST(1 AS bit) AS MyTrue"
                     "FROM"
                     "  dbo.orders"
                     "WHERE"
                     "  0 = 1"]
                    :expected-types [:type/Boolean]
                    :expected-rows  []}
                   {:desc "not filter"
                    :query
                    (orders-query {:filter [:not false-value]})
                    :expected-sql
                    ["SELECT"
                     "  TOP(1) CAST(1 AS bit) AS MyTrue"
                     "FROM"
                     "  dbo.orders"
                     "WHERE"
                     "  NOT (0 = 1)"]
                    :expected-types [:type/Boolean]
                    :expected-rows  [[true]]}
                   {:desc "nested logical operators"
                    :query
                    (orders-query {:filter [:and
                                            [:not false-value]
                                            [:or
                                             [:expression "MyFalse"]
                                             [:expression "MyTrue"]]]})
                    :expected-sql
                    ["SELECT"
                     "  TOP(1) CAST(1 AS bit) AS MyTrue"
                     "FROM"
                     "  dbo.orders"
                     "WHERE"
                     "  NOT (0 = 1)"
                     "  AND ("
                     "    (0 = 1)"
                     "    OR (1 = 1)"
                     "  )"]
                    :expected-types [:type/Boolean]
                    :expected-rows  [[true]]}
                   {:desc "case expression"
                    :query
                    (orders-query {:expressions {"MyTrue"  true-value
                                                 "MyFalse" false-value
                                                 "MyCase"  [:case [[[:expression "MyFalse"] false-value]
                                                                   [[:expression "MyTrue"]  true-value]]]}
                                   :fields [[:expression "MyCase"]]})
                    :expected-sql
                    ["SELECT"
                     "  TOP(1) CASE"
                     "    WHEN 0 = 1 THEN 0"
                     "    WHEN 1 = 1 THEN 1"
                     "  END AS MyCase"
                     "FROM"
                     "  dbo.orders"]
                    :expected-types [:type/Integer]
                    :expected-rows  [[1]]}
                   ;; only top-level booleans should be transformed; otherwise an expression like 1 = 1 gets compiled
                   ;; to (1 = 1) = (1 = 1)
                   {:desc "non-top-level booleans"
                    :query
                    (orders-query {:filter [:= true-value true-value]})
                    :expected-sql
                    ["SELECT"
                     "  TOP(1) CAST(1 AS bit) AS MyTrue"
                     "FROM"
                     "  dbo.orders"
                     "WHERE"
                     "  1 = 1"]
                    :expected-types [:type/Boolean]
                    :expected-rows  [[true]]}]]
            (testing (format "\n%s\nMBQL query = %s\n" desc query)
              (testing "Should generate the correct SQL query"
                (is (= expected-sql
                       (pretty-sql (:query (qp.compile/compile query))))))
              (testing "Should return correct results"
                (let [result (qp/process-query query)
                      rows (mt/rows result)
                      cols (mt/cols result)
                      results-metadata-cols (-> result :data :results_metadata :columns)]
                  (is (= expected-rows
                         rows))
                  (is (= expected-types
                         (map :base_type cols)))
                  (is (= expected-types
                         (map :base_type results-metadata-cols))))))))))))

(deftest filter-by-datetime-fields-test
  (mt/test-driver :sqlserver
    (testing "Should match datetime fields even in non-default timezone (#30454)"
      (mt/dataset attempted-murders
        (let [limit 10
              get-query (mt/mbql-query attempts
                          {:fields [$id $datetime]
                           :order-by [[:asc $id]]
                           :limit limit})
              filter-query (mt/mbql-query attempts
                             {:fields [$id $datetime]
                              :filter [:= [:field %attempts.datetime {:base-type :type/DateTime}]]
                              :order-by [[:asc $id]]
                              :limit limit})]
          (doseq [with-tz-setter [#'qp.test-util/do-with-report-timezone-id!
                                  #'test.tz/do-with-system-timezone-id!
                                  #'qp.test-util/do-with-database-timezone-id
                                  #'qp.test-util/do-with-results-timezone-id]
                  timezone ["UTC" "Pacific/Auckland"]]
            (testing (str with-tz-setter " " timezone)
              (with-tz-setter timezone
                (fn []
                  (let [expected-result (-> get-query qp/process-query mt/rows)
                        filter-query (update-in filter-query [:query :filter] into (map second) expected-result)]
                    (mt/with-native-query-testing-context filter-query
                      (is (= expected-result
                             (-> filter-query qp/process-query mt/rows))))))))))))))

(deftest ^:parallel filter-by-datetime-against-localdate-time-test
  (mt/test-driver :sqlserver
    (testing "Filtering datetime fields by localdatetime objects should work"
      (mt/dataset attempted-murders
        (let [tricky-datetime        "2019-11-02T00:14:14.247"
              datetime-string        (-> tricky-datetime
                                         (str/replace #"T" " "))
              datetime-localdatetime (t/local-date-time (u.date/parse tricky-datetime))
              base-query             (qp.store/with-metadata-provider (mt/id)
                                       (first
                                        (sql.qp/format-honeysql
                                         :sqlserver
                                         {:select [:id]
                                          :from   [:attempts]
                                          :where  (sql.qp/->honeysql
                                                   :sqlserver
                                                   [:=
                                                    [:field (mt/id :attempts :datetime) nil]
                                                    (sql.qp/compiled [:raw "?"])])})))]
          (doseq [param [datetime-string datetime-localdatetime]
                  :let  [query [base-query param]]]
            (testing (pr-str query)
              (is (= [{:id 2}]
                     (sql-jdbc.execute/do-with-connection-with-options
                      :sqlserver
                      (mt/id)
                      {}
                      (fn [^java.sql.Connection conn]
                        (next.jdbc/execute! conn query))))))))))))

(deftest ^:parallel db-default-timezone-test
  (mt/test-driver :sqlserver
    (is (= "Z" (str (driver/db-default-timezone :sqlserver (mt/db)))))))

(deftest ^:parallel default-database-role-test
  (testing "SQL Server default database role handling"
    (testing "returns role when explicitly configured"
      (let [database {:details {:user "login_user" :role "db_user"}}]
        (is (= "db_user" (driver.sql/default-database-role :sqlserver database)))))

    (testing "returns nil when no role is configured"
      (let [database {:details {:user "login_user"}}]
        (is (nil? (driver.sql/default-database-role :sqlserver database)))))

    (testing "returns nil even when user is 'sa'"
      (let [database {:details {:user "sa"}}]
        (is (nil? (driver.sql/default-database-role :sqlserver database)))))

    (testing "ignores user field and only uses role field"
      (let [database {:details {:user "login_user" :role "impersonation_user"}}]
        (is (= "impersonation_user" (driver.sql/default-database-role :sqlserver database)))))))

(deftest ^:parallel wtf-test
  (driver/with-driver :sqlserver
    (qp.store/with-metadata-provider (mt/id)
      (binding [sql.qp/*inner-query* {:expressions
                                      {"NameEquals"
                                       [:=
                                        [:field
                                         "LiteralString"
                                         {:base-type                      :type/Text
                                          :join-alias                     "JoinedCategories"
                                          driver-api/qp.add.source-table  "JoinedCategories"
                                          driver-api/qp.add.source-alias  "LiteralString"
                                          driver-api/qp.add.desired-alias "JoinedCategories__LiteralString"}]
                                        [:field
                                         (mt/id :venues :name)
                                         {driver-api/qp.add.source-table  (mt/id :venues)
                                          driver-api/qp.add.source-alias  "name"
                                          driver-api/qp.add.desired-alias "name"}]]}}]

        (is (= {:where
                [:=
                 [::h2x/identifier :field ["JoinedCategories" "LiteralString"]]
                 [::h2x/typed
                  [::h2x/identifier :field ["dbo" "venues" "name"]]
                  {:database-type "varchar"}]]}
               (sql.qp/apply-top-level-clause
                :sqlserver
                :filter
                {}
                {:filter [:expression "NameEquals" {:base-type                      :type/Boolean
                                                    driver-api/qp.add.source-table  driver-api/qp.add.none
                                                    driver-api/qp.add.desired-alias nil}]})))))))

(deftest ^:parallel type->database-type-test
  (testing "type->database-type multimethod returns correct SQL Server types"
    (are [base-type expected] (= expected (driver/type->database-type :sqlserver base-type))
      :type/Boolean            [:bit]
      :type/Date               [:date]
      :type/DateTime           [:datetime2]
      :type/DateTimeWithTZ     [:datetimeoffset]
      :type/Decimal            [:decimal]
      :type/Float              [:float]
      :type/Integer            [:int]
      :type/Number             [:bigint]
      :type/Text               [:text]
      :type/Time               [:time]
      :type/UUID               [:uniqueidentifier])))

(deftest ^:parallel compile-transform-test
  (mt/test-driver :sqlserver
    (testing "compile-transform creates SELECT INTO"
      (is (= ["SELECT * INTO \"PRODUCTS_COPY\" FROM products" nil]
             (driver/compile-transform :sqlserver {:query {:query "SELECT * FROM products"}
                                                   :output-table "PRODUCTS_COPY"}))))
    (testing "compile-insert generates INSERT INTO"
      (is (= ["INSERT INTO \"PRODUCTS_COPY\" SELECT * FROM products" nil]
             (driver/compile-insert :sqlserver {:query {:query "SELECT * FROM products"}
                                                :output-table "PRODUCTS_COPY"}))))))
