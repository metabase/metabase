(ns metabase.driver.sqlserver-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [colorize.core :as colorize]
   [honey.sql :as sql]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util.unprepare :as unprepare]
   [metabase.driver.sqlserver :as sqlserver]
   [metabase.models :refer [Database]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.test :as mt]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util.date-2 :as u.date]
   [next.jdbc]
   [toucan2.tools.with-temp :as t2.with-temp]))

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
      (is (query= expected
                  (#'sqlserver/fix-order-bys original)))
      (testing "Inside `:source-query`"
        (is (query= {:source-query expected}
                    (#'sqlserver/fix-order-bys {:source-query original})))))))

(deftest ^:parallel fix-order-bys-test-2
  (testing "Add limit for :source-query order bys"
    (mt/$ids nil
      (let [original {:source-table 1
                      :order-by     [[:asc 2]]}]
        (testing "Not in a source query -- don't do anything"
          (is (query= original
                      (#'sqlserver/fix-order-bys original))))
        (testing "In source query -- add `:limit`"
          (is (query= {:source-query (assoc original :limit qp.i/absolute-max-results)}
                      (#'sqlserver/fix-order-bys {:source-query original}))))
        (testing "In source query in source query-- add `:limit` at both levels"
          (is (query= {:source-query {:source-query (assoc original :limit qp.i/absolute-max-results)
                                      :order-by     [[:asc [:field 1]]]
                                      :limit        qp.i/absolute-max-results}}
                      (#'sqlserver/fix-order-bys {:source-query {:source-query original
                                                                 :order-by     [[:asc [:field 1]]]}}))))
        (testing "In source query inside source query for join -- add `:limit`"
          (is (query= {:joins [{:source-query {:source-query (assoc original :limit qp.i/absolute-max-results)}}]}
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
                           (m/dissoc-in [:query :limit]))]
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
                 (is (= [#t "2019-02-01"]
                        (row-thunk))))))
           ;; rollback transaction so `temp` table gets discarded
           (finally
             (.rollback conn))))))))

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
          #_{:clj-kondo/ignore [:discouraged-var]}
          (testing (format "Convert %s to SQL literal" (colorize/magenta (with-out-str (pr t))))
            (let [sql (format "SELECT %s AS t;" (unprepare/unprepare-value :sqlserver t))]
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
                                 :breakout    [[:field $date {:temporal-unit unit}]]}))))))))))))

(deftest ^:parallel max-results-bare-rows-test
  (mt/test-driver :sqlserver
    (testing "Should support overriding the ROWCOUNT for a specific SQL Server DB (#9940)"
      (t2.with-temp/with-temp [Database db {:name    "SQL Server with ROWCOUNT override"
                                            :engine  "sqlserver"
                                            :details (-> (:details (mt/db))
                                                         ;; SQL server considers a ROWCOUNT of 0 to be unconstrained
                                                         ;; we are putting this in the details map, since that's where connection
                                                         ;; properties go in a client save operation, but it will be MOVED to the
                                                         ;; settings map instead (which is where DB-local settings go), via the
                                                         ;; driver/normalize-db-details implementation for :sqlserver
                                                         (assoc :rowcount-override 0))}]
        ;; TODO FIXME -- This query probably shouldn't be returning ANY rows given that we're setting the LIMIT to zero.
        ;; For now I've had to keep a bug where it always returns at least one row regardless of the limit. See comments
        ;; in [[metabase.query-processor.middleware.limit/limit-xform]].
        (mt/with-db db
          (is (= 3000 (-> {:query (str "DECLARE @DATA AS TABLE(\n"
                                       "    IDX INT IDENTITY(1,1),\n"
                                       "    V INT\n"
                                       ")\n"
                                       "DECLARE @STEP INT \n"
                                       "SET @STEP = 1\n"
                                       "WHILE @STEP <=3000\n"
                                       "BEGIN\n"
                                       "    INSERT INTO @DATA(V)\n"
                                       "    SELECT 1\n"
                                       "    SET @STEP = @STEP + 1\n"
                                       "END \n"
                                       "\n"
                                       "DECLARE @TEMP AS TABLE(\n"
                                       "    IDX INT IDENTITY(1,1),\n"
                                       "    V INT\n"
                                       ")\n"
                                       "INSERT INTO @TEMP(V)\n"
                                       "SELECT V FROM @DATA\n"
                                       "\n"
                                       "SELECT COUNT(1) FROM @TEMP\n")}
                          mt/native-query
                          qp/userland-query
                          qp/process-query
                          mt/rows
                          ffirst))))))))

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
