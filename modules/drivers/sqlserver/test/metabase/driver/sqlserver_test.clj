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
            [metabase.driver.sqlserver :as sqlserver]
            [metabase.models :refer [Card Database]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.interface :as qp.i]
            [metabase.query-processor.middleware.constraints :as qp.constraints]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest fix-order-bys-test
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
                    (#'sqlserver/fix-order-bys {:source-query original})))))

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
                         {:joins [{:source-query {:source-query original}}]})))))))))

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
      (is (sql= '{:select [TOP 1048575 source.name AS name]
                  :from   [{:select   [TOP 1048575 dbo.venues.name AS name]
                            :from     [dbo.venues]
                            :order-by [dbo.venues.id ASC]}
                           source]}
                (mt/mbql-query venues
                  {:source-query {:source-table $$venues
                                  :fields       [$name]
                                  :order-by     [[:asc $id]]}}))))))

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
             (qp/compile
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
                           qp/preprocess
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
                     (pretty-sql (:query (qp/compile (query-with-bucketing unit)))))))
            (testing "Should still return correct results"
              (is (= expected-rows
                     (take 5 (mt/rows
                               (mt/run-mbql-query checkins
                                 {:aggregation [[:count]]
                                  :breakout    [[:field $date {:temporal-unit unit}]]}))))))))))))
(deftest max-results-bare-rows-test
  (mt/test-driver :sqlserver
    (testing "Should support overriding the ROWCOUNT for a specific SQL Server DB (#9940)"
      (mt/with-temp Database [db {:name    "SQL Server with ROWCOUNT override"
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
                         ;; add default query constraints to ensure the default limit of 2000 is overridden by the
                         ;; `:rowcount-override` connection property we defined in the details above
                         (assoc :constraints (qp.constraints/default-query-constraints))
                         qp/process-query
                         mt/rows
                         ffirst))))))))

;;; --- PERCENTILE AGGREGATIONS WITH USE OF WINDOW FUNCTION ----------------------------------------------------------

(deftest precentile-aggregations-median-test
  (mt/test-driver
   :sqlserver
   (testing "Use of mbql :median aggregation yields correct result rows"
     (let [result
           (mt/run-mbql-query
            venues
            {:aggregation [[:aggregation-options [:median $price] {:name "median of price over category"}]]
             :breakout    [$category_id]
             :order-by    [[:asc $category_id]]
             :limit       3})]
       (is (= [[2 2.5] [3 2.0] [4 2.0]]
              (mt/rows result)))))))

(deftest precentile-aggregations-various-values-test
  (mt/test-driver
   :sqlserver
   (testing "Aggregation is computed correctly for various percentile values"
     (is (= [[2 2.0 2.0 2.99 3.0 3.0]
             [3 2.0 2.0 2.0 2.0 2.0]
             [4 1.22 1.64 2.14 2.54 2.92]]
            (->> (mt/run-mbql-query
                  venues
                  {:aggregation [[:aggregation-options [:percentile $price 0.11] {:name "p11"}]
                                 [:aggregation-options [:percentile $price 0.32] {:name "p34"}]
                                 [:aggregation-options [:percentile $price 0.57] {:name "p57"}]
                                 [:aggregation-options [:percentile $price 0.77] {:name "p77"}]
                                 [:aggregation-options [:percentile $price 0.96] {:name "p96"}]]
                   :breakout    [$category_id]
                   :order-by    [[:asc $category_id]]
                   :limit       3})
                 (mt/formatted-rows [int 2.0 2.0 2.0 2.0 2.0])))))))


(deftest percentile-aggregations-breakout-test
  (mt/test-driver
   :sqlserver
   (testing "Percentile aggregation without breakout yields correct results"
       (is (= [[2.0]]
              (-> (mt/run-mbql-query
                   venues
                   {:aggregation [[:aggregation-options [:percentile $price 0.5] {:name "P50 price"}]]})
                  mt/rows))))
   (testing "Percentile aggregation with breakout yields correct results"
       (is (= [[2 2.5] [3 2.0] [4 2.0] [5 2.0] [6 1.5]]
              (-> (mt/run-mbql-query
                   venues
                   {:aggregation [[:aggregation-options [:percentile $price 0.5] {:name "P50 price"}]]
                    :breakout    [$category_id]
                    :limit       5
                    :order-by    [[:asc $category_id]]})
                  mt/rows))))
   (testing "Percentile aggregation with multiple breakout fields yields correct results"
     (mt/dataset
      sample-dataset
      (is (= [[1 6 102.8] [1 14 39.72] [1 55 101.04] [1 60 31.44] [1 65 63.33]]
             (-> (mt/run-mbql-query
                  orders
                  {:aggregation [[:percentile $total 0.5]]
                   :breakout    [$user_id $product_id]
                   :limit       5
                   :order-by    [[:asc $user_id]]})
                 mt/rows)))))
   (testing "Percentile aggregation with expression breakout yields correct results"
     (mt/dataset
      sample-dataset
      (is (= [[108 149.61] [2649 148.56] [2650 147.58] [1119 144.785] [21 140.08]]
             (-> (mt/run-mbql-query
                  orders
                  {:expressions {"user_id + product_id" [:+ $user_id $product_id]}
                   :aggregation [[:percentile $total 0.5]]
                   :breakout    [[:expression "user_id + product_id"]]
                   :limit       5
                   :order-by    [[:desc [:aggregation 0]]]})
                 mt/rows)))))))

(deftest percentile-aggregations-column-ordering-test
  (mt/test-driver
   :sqlserver
   (testing "Result columns are ordered correctly for query containing percentile aggregation"
     (is (= [[2 20 2.5] [3 4 2.0] [4 4 2.0] [5 14 2.0] [6 3 1.5]]
            (-> (mt/run-mbql-query
                 venues
                 {:aggregation [[:aggregation-options [:sum $price] {:name "sum_price"}]
                                [:aggregation-options [:percentile $price 0.5] {:name "p50_price"}]]
                  :breakout    [$category_id]
                  :limit       5
                  :order-by    [[:asc $category_id]]})
                mt/rows))))))

(deftest percentile-aggregations-duplicate-name-test
  (mt/test-driver
   :sqlserver
   (testing "Aggregations (including percentile) with duplicate name should return correct results"
     (is (= [[2 2.5 2.5 20] [3 2.0 2.0 4] [4 2.0 2.0 4]]
            (-> (mt/run-mbql-query
                 venues
                 {:aggregation [[:aggregation-options [:median $price] {:name "A"}]
                                [:aggregation-options [:percentile $price 0.5] {:name "A"}]
                                [:aggregation-options [:sum $price] {:name "A"}]]
                  :breakout    [$category_id]
                  :order-by    [[:asc $category_id]]
                  :limit       3})
                mt/rows))))))

(deftest percentile-aggregations-with-expressions-test
  (mt/test-driver
   :sqlserver
   (testing "Query containing percentile aggregations and expressions yields correct results"
     (mt/dataset
      sample-dataset
      (is (= [[8 155.52 631669.78 631825.3]
              [12 220.35 428531.11 428751.46]
              [16 293.72 368660.62 368954.34]
              [20 370.05 343879.32 344249.37]
              [24 444.3 243971.04 244415.34]]
             (->> (mt/run-mbql-query
                  orders
                  {;; 1. expression with source of percentile aggregation
                   :fields       [*quantity_times_4/Integer
                                  *p50/Float
                                  *sum/Integer
                                  [:expression "p50 + sum"]]
                    :expressions  {"p50 + sum" [:+ *p50/Float *sum/Integer]}
                   :source-query {:source-table $$orders
                                  :expressions  {"total + subtotal" [:+ $total $subtotal]
                                                 "quantity * total" [:* $total $quantity]
                                                 "quantity_times_4" [:* $quantity 4]}
                                  ;; 2. expression used in filter in "source data" for aggregations
                                  :filter       [:< [:expression "total + subtotal"] [:expression "quantity * total"]]
                                  :aggregation  [;; 3. other aggregation has expression source
                                                 [:aggregation-options 
                                                  [:sum [:expression "total + subtotal"]] {:name "sum"}]
                                                 ;; 4. other than percentile aggregation used with expression
                                                 [:aggregation-options 
                                                  [:percentile [:expression "quantity * total"] 0.5] {:name "p50"}]]
                                  :breakout     [[:expression "quantity_times_4"]]
                                  :limit        5}})
                  (mt/formatted-rows [int 2.0 2.0 2.0]))))))))


(deftest percentile-aggregations-as-source-test
  (mt/test-driver
   :sqlserver
   (testing "Query with percentile aggregation as source for other computation produces expected results"
     (mt/dataset
      sample-dataset
      (is (= [[82.18 34 50.45]
              [82.29 11 50.56]
              [82.33 33 50.54]
              [82.43 37 50.6]
              [84.43 24 51.83]]
             (-> (mt/run-mbql-query
                  orders
                  {;; percentile as source for expression
                   :expressions  {"p75 + subtotal" [:+ *p75/Float &Orders.subtotal]}
                   ;; percentile as source for filter
                   :filter       [:> *p75/Float 50]
                   :aggregation  [;; percentile as source for other aggregation
                                  [:aggregation-options [:count *p75/Float] {:name "count"}]
                                  ;; percentile as source for percentile aggregation
                                  [:aggregation-options [:percentile *p75/Float 0.3] {:name "p30"}]]
                   :breakout     [[:expression "p75 + subtotal"]]
                   :order-by     [[:asc [:expression "p75 + subtotal"]]]
                   :limit        5
                   :joins        [{:alias        "Orders"
                                   :strategy     :inner-join
                                   :source-table $$orders
                                   :condition    [:= &Orders.product_id $product_id]}]
                   :source-query {:source-table $$orders
                                  :aggregation  [[:aggregation-options [:percentile $total 0.75] {:name "p75"}]]
                                  :breakout     [$product_id]}})
                 mt/rows)))))))

(deftest percentile-aggregations-with-joins-test
  (mt/test-driver
   :sqlserver
   (mt/dataset
    sample-dataset
    (testing "Percentile aggregation column can be joined"
      (is (= [[448 61 1 30.86 116.91]
              [493 65 1 30.64 76.6]
              [607 74 1 47.28 53.91]
              [761 98 1 46.73 70.26]
              [979 138 1 47.23 63.62]]
             (-> (mt/run-mbql-query
                  orders
                  {:fields   [$id $user_id $product_id $total &Perc.*p50/Float]
                   :limit    5
                   :order-by [[:asc $product_id] [:asc $id] [:asc $user_id]]
                   :joins    [{:alias        "Perc"
                               :strategy     :inner-join
                               :condition    [:= &Perc.user_id $user_id]
                               :source-query {:source-table $$orders
                                              :aggregation  [[:aggregation-options
                                                              [:percentile $total 0.5]
                                                              {:name "p50"}]]
                                              :breakout     [$user_id]}}]})
                 mt/rows))))
    (testing "Percentile aggregation can be computed on joined column"
      (is (= [[1 25.1] [2 73.95] [3 35.15] [4 72.81] [5 85.25]]
             (-> (mt/run-mbql-query
                  orders
                  {:joins       [{:alias        "Products"
                                  :strategy     :inner-join
                                  :fields       :all
                                  :condition    [:= &Products.id $product_id]
                                  :source-table $$products}]
                   :aggregation [[:aggregation-options [:percentile &Products.products.price 0.5] {:name "p50"}]]
                   :breakout    [$id]
                   :limit       5
                   :order-by    [[:asc $id]]})
                 mt/rows)))))))

(deftest percentile-aggregations-card-test
  (mt/test-driver
   :sqlserver
   (mt/dataset
    sample-dataset
     (mt/with-temp* [Card [{id :id}
                           {:dataset_query
                            (mt/mbql-query
                            orders
                             {:aggregation [[:aggregation-options
                                            [:percentile $total 0.5]
                                            {:name "p50"}]]
                             :breakout    [$user_id]})}]]
      (testing "Percentile aggregation from card is usable in joining query"
        (is (= [[448 61 1 116.91]
                [493 65 1 76.6]
                [607 74 1 53.91]
                [761 98 1 70.26]
                [979 138 1 63.62]]
               (-> (mt/run-mbql-query
                    orders
                    {:fields [$id $user_id $product_id &Q.*p50/Float]
                     :joins [{:alias "Q"
                              :strategy :inner-join
                              :condition [:= &Q.user_id $user_id]
                              :source-table (str "card__" id)}]
                     :order-by [[:asc $product_id] [:asc $id] [:asc $user_id]]
                     :limit 5})
                   mt/rows))))))))

(deftest percentile-aggregations-order-by-reference-test
  (mt/test-driver
   :sqlserver
   (mt/dataset
    sample-dataset
    (testing "Percentile query with aggregation reference in :orded-by yields correct results"
      (is (= [[721 29.99] [2474 30.52] [1201 31.25] [2022 32.835] [2261 33.0]]
             (-> (mt/run-mbql-query
                  orders
                  {:aggregation [[:median $total]]
                   :breakout [$user_id]
                   :order-by [[:asc [:aggregation 0]]]
                   :limit 5})
                 mt/rows)))
      (is (= [[2372 46 80.57]
              [918 45 72.96]
              [1352 39 74.57]
              [65 37 76.6]
              [1066 37 76.69]]
             (-> (mt/run-mbql-query
                  orders
                  {:aggregation [[:count $total] [:median $total]]
                   :breakout [$user_id]
                   :order-by [[:desc [:aggregation 0]]]
                   :limit 5})
                 mt/rows)))
      (is (= [[1805 1 154.1]
              [2391 3 150.49]
              [1835 1 148.28]
              [1809 1 147.89]
              [1020 1 145.09]]
             (-> (mt/run-mbql-query
                  orders
                  {:aggregation [[:count $total] [:median $total]]
                   :breakout [$user_id]
                   :order-by [[:desc [:aggregation 1]]]
                   :limit 5})
                 mt/rows)))
      (is (= [[2372 46 80.57 3830.94]
              [918 45 72.96 3523.71]
              [1593 36 110.12 3459.03]
              [1317 35 101.35 3401.53]
              [1352 39 74.57 3328.43]]
             (->> (mt/run-mbql-query
                   orders
                   {:aggregation [[:count $total] [:median $total] [:sum $total]]
                    :breakout [$user_id]
                    :order-by [[:desc [:aggregation 2]]]
                    :limit 5})
                  (mt/formatted-rows [int int 2.0 2.0]))))))))
