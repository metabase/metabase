(ns metabase.driver.sqlserver-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [colorize.core :as colorize]
            [honeysql.core :as hsql]
            [java-time :as t]
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.query-processor :as qp]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.test :as mt]))

;;; -------------------------------------------------- VARCHAR(MAX) --------------------------------------------------

(defn- a-gene
  "Really long string representing a gene like \"GGAGCACCTCCACAAGTGCAGGCTATCCTGTCGAGTAAGGCCT...\""
  []
  (apply str (repeatedly 1000 (partial rand-nth [\A \G \C \T]))))

(mt/defdataset ^:private genetic-data
  [["genetic-data"
    [{:field-name "gene", :base-type {:native "VARCHAR(MAX)"}, :effective-type :type/Text}]
    [[(a-gene)]]]])

(deftest clobs-should-come-back-as-text-test
  (mt/test-driver :sqlserver
    (testing "Make sure something long doesn't come back as some weird type like `ClobImpl`"
      (is (= [[1 (-> genetic-data :table-definitions first :rows ffirst)]]
             (-> (mt/dataset genetic-data (mt/run-mbql-query genetic-data))
                 mt/rows
                 mt/obj->json->obj)))))) ; convert to JSON + back so the Clob gets stringified

(deftest connection-spec-test
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

(deftest add-max-results-limit-test
  (mt/test-driver :sqlserver
    (testing (str "SQL Server doesn't let you use ORDER BY in nested SELECTs unless you also specify a TOP (their "
                  "equivalent of LIMIT). Make sure we add a max-results LIMIT to the nested query")
      (is (= {:query (str "SELECT TOP 1048575 \"source\".\"name\" AS \"name\" "
                          "FROM ("
                          "SELECT TOP 1048575 "
                          "\"dbo\".\"venues\".\"name\" AS \"name\" "
                          "FROM \"dbo\".\"venues\" "
                          "ORDER BY \"dbo\".\"venues\".\"id\" ASC"
                          " ) \"source\" ") ; not sure why this generates an extra space before the closing paren, but it does
              :params nil}
             (qp/query->native
              (mt/mbql-query venues
                {:source-query {:source-table $$venues
                                :fields       [$name]
                                :order-by     [[:asc $id]]}})))))))

(deftest preserve-existing-top-clauses
  (mt/test-driver :sqlserver
    (testing (str "make sure when adding TOP clauses to make ORDER BY work we don't stomp over any explicit TOP "
                  "clauses that may have been set in the query")
      (is (= {:query  (str "SELECT TOP 10 \"source\".\"name\" AS \"name\" "
                           "FROM ("
                           "SELECT TOP 20 "
                           "\"dbo\".\"venues\".\"name\" AS \"name\" "
                           "FROM \"dbo\".\"venues\" "
                           "ORDER BY \"dbo\".\"venues\".\"id\" ASC"
                           " ) \"source\" ")
              :params nil}
             (qp/query->native
              (mt/mbql-query venues
                {:source-query {:source-table $$venues
                                :fields       [$name]
                                :order-by     [[:asc $id]]
                                :limit        20}
                 :limit        10})))))))

(deftest dont-add-top-clauses-for-top-level-test
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
                           qp/query->preprocessed
                           (m/dissoc-in [:query :limit]))]
      (mt/with-everything-store
        (is (= {:query  (str "SELECT \"source\".\"name\" AS \"name\" "
                             "FROM ("
                             "SELECT TOP 1048575 "
                             "\"dbo\".\"venues\".\"name\" AS \"name\" "
                             "FROM \"dbo\".\"venues\" "
                             "ORDER BY \"dbo\".\"venues\".\"id\" ASC"
                             " ) \"source\" "
                             "ORDER BY \"source\".\"id\" ASC")
                :params nil}
               (driver/mbql->native :sqlserver preprocessed)))))))

(deftest max-results-should-actually-work-test
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

(deftest locale-bucketing-test
  (mt/test-driver :sqlserver
    (testing (str "Make sure datetime bucketing functions work properly with languages that format dates like "
                  "yyyy-dd-MM instead of yyyy-MM-dd (i.e. not American English) (#9057)")
      ;; we're doing things here with low-level calls to HoneySQL (emulating what the QP does) instead of using normal
      ;; QP pathways because `SET LANGUAGE` doesn't seem to persist to subsequent executions so to test that things
      ;; are working we need to add to in from of the query we're trying to check
      (with-open [conn (sql-jdbc.execute/connection-with-timezone :sqlserver (mt/db) (qp.timezone/report-timezone-id-if-supported))]
        (.setAutoCommit conn false)
        (try
          (doseq [[sql & params] [["DROP TABLE IF EXISTS temp;"]
                                  ["CREATE TABLE temp (d DATETIME2);"]
                                  ["INSERT INTO temp (d) VALUES (?)" #t "2019-02-08T00:00:00Z"]
                                  ["SET LANGUAGE Italian;"]]]
            (with-open [stmt (sql-jdbc.execute/prepared-statement :sqlserver conn sql params)]
              (.execute stmt)))
          (let [[sql & params] (hsql/format {:select [[(sql.qp/date :sqlserver :month :temp.d) :my-date]]
                                             :from   [:temp]}
                                 :quoting :ansi, :allow-dashed-names? true)]
            (with-open [stmt (sql-jdbc.execute/prepared-statement :sqlserver conn sql params)
                        rs   (sql-jdbc.execute/execute-prepared-statement! :sqlserver stmt)]
              (let [row-thunk (sql-jdbc.execute/row-thunk :sqlserver rs (.getMetaData rs))]
                (is (= [#t "2019-02-01"]
                       (row-thunk))))))
          ;; rollback transaction so `temp` table gets discarded
          (finally
            (.rollback conn)))))))

(deftest unprepare-test
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
          (testing (format "Convert %s to SQL literal" (colorize/magenta (with-out-str (pr t))))
            (let [sql (format "SELECT %s AS t;" (unprepare/unprepare-value :sqlserver t))]
              (with-open [conn (sql-jdbc.execute/connection-with-timezone :sqlserver (mt/db) nil)
                          stmt (sql-jdbc.execute/prepared-statement :sqlserver conn sql nil)
                          rs   (sql-jdbc.execute/execute-prepared-statement! :sqlserver stmt)]
                (let [row-thunk (sql-jdbc.execute/row-thunk :sqlserver rs (.getMetaData rs))]
                  (is (= [expected]
                         (row-thunk))
                      (format "SQL %s should return %s" (colorize/blue (pr-str sql)) (colorize/green expected))))))))))))

(defn- pretty-sql [s]
  (str/replace s #"\"" ""))

(deftest optimal-filter-clauses-test
  (mt/test-driver :sqlserver
    (testing "Should use efficient functions like year() for date bucketing (#9934)"
      (letfn [(query-with-bucketing [unit]
                (mt/mbql-query checkins
                  {:aggregation [[:count]]
                   :breakout    [[:field $date {:temporal-unit unit}]]}))]
        (doseq [[unit {:keys [expected-sql expected-rows]}]
                {"year"
                 {:expected-sql
                  (str "SELECT DateFromParts(year(dbo.checkins.date), 1, 1) AS date,"
                       " count(*) AS count "
                       "FROM dbo.checkins "
                       "GROUP BY year(dbo.checkins.date) "
                       "ORDER BY year(dbo.checkins.date) ASC")

                  :expected-rows
                  [["2013-01-01T00:00:00Z" 235]
                   ["2014-01-01T00:00:00Z" 498]
                   ["2015-01-01T00:00:00Z" 267]]}

                 "month"
                 {:expected-sql
                  (str "SELECT DateFromParts(year(dbo.checkins.date), month(dbo.checkins.date), 1) AS date,"
                       " count(*) AS count "
                       "FROM dbo.checkins "
                       "GROUP BY year(dbo.checkins.date), month(dbo.checkins.date) "
                       "ORDER BY year(dbo.checkins.date) ASC, month(dbo.checkins.date) ASC")

                  :expected-rows
                  [["2013-01-01T00:00:00Z" 8]
                   ["2013-02-01T00:00:00Z" 11]
                   ["2013-03-01T00:00:00Z" 21]
                   ["2013-04-01T00:00:00Z" 26]
                   ["2013-05-01T00:00:00Z" 23]]}

                 "day"
                 {:expected-sql
                  (str "SELECT DateFromParts(year(dbo.checkins.date), month(dbo.checkins.date), day(dbo.checkins.date)) AS date,"
                       " count(*) AS count "
                       "FROM dbo.checkins "
                       "GROUP BY year(dbo.checkins.date), month(dbo.checkins.date), day(dbo.checkins.date) "
                       "ORDER BY year(dbo.checkins.date) ASC, month(dbo.checkins.date) ASC, day(dbo.checkins.date) ASC")

                  :expected-rows
                  [["2013-01-03T00:00:00Z" 1]
                   ["2013-01-10T00:00:00Z" 1]
                   ["2013-01-19T00:00:00Z" 1]
                   ["2013-01-22T00:00:00Z" 1]
                   ["2013-01-23T00:00:00Z" 1]]}}]
          (testing (format "\nUnit = %s\n" unit)
            (testing "Should generate the correct SQL query"
              (is (= expected-sql
                     (pretty-sql (:query (qp/query->native (query-with-bucketing unit)))))))
            (testing "Should still return correct results"
              (is (= expected-rows
                     (take 5 (mt/rows
                               (mt/run-mbql-query checkins
                                 {:aggregation [[:count]]
                                  :breakout    [[:field $date {:temporal-unit unit}]]}))))))))))))
