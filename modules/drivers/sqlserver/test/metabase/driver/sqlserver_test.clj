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

(deftest median-aggregation-test
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

(deftest percentile-aggregation-breakout-test
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
                  {:aggregation [[:aggregation-options [:percentile $total 0.5] {:name "P50 price"}]]
                   :breakout    [$user_id $product_id]
                   :limit       5
                   :order-by    [[:asc $user_id]]})
                 mt/rows)))))
   (testing "Percentile aggregation with expression breakout yields correct results"
     (mt/dataset
      sample-dataset
      (is (= [[494000 77.23]
              [491712 72.18]
              [491600 73.2]
              [486864 72.96]
              [486684 70.15]]
             (-> (mt/run-mbql-query
                  orders
                  {:expressions {"user_id * product_id" [:* $user_id $product_id]}
                   :aggregation [[:aggregation-options [:sum $total] {:name "P50 price"}]]
                   :breakout    [[:expression "user_id * product_id"]]
                   :limit       5
                   :order-by    [[:desc [:expression "user_id * product_id"]]]})
                 mt/rows)))))))

(comment
  (mt/set-test-drivers! [:sqlserver :postgres])
  (metabase.test-runner/run [#'metabase.driver.sqlserver-test/simple-percentile-aggregations-test])
  )

(deftest duplicate-name-aggregations-test
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
                 ;; rounding because of postgres to sqlserver inconsistencies working with floats
                 ;; gut feeling here is that it is ok, but may further investigate
                 ;; sth. like 428751.46000000014 vs 428751.46
                 (mt/formatted-rows [int 
                                     #(u/round-to-decimals 6 %) 
                                     #(u/round-to-decimals 6 %) 
                                     #(u/round-to-decimals 6 %)]))))))))

(comment
(deftest percentile-aggregation-as-source-test
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

(comment
;; TODO -- add here all card scenarios
(deftest percentile-aggregations-with-card-test
  (mt/test-driver
   :sqlserver
   (testing "Percentile on card results is correct"
     (mt/with-temp* [Card [{id :id}
                           {:dataset_query
                            (mt/mbql-query
                             venues
                             {:aggregation [[:aggregation-options
                                             [:percentile [:field (mt/id :venues :price) nil] 0.5]
                                             {:name "median of price over category"}]]
                              :breakout    [[:field (mt/id :venues :category_id) nil]]
                              :order-by [[:asc [:field (mt/id :venues :category_id) nil]]]})}]]
       (let [query (mt/mbql-query
                    venues
                    {:joins [{:alias (str "Question " id)
                              :fields :all
                              :source-table (str "card__" id)
                              :condition [:=
                                          [:field (mt/id :venues :category_id) nil]
                                          [:field (mt/id :venues :category_id)
                                           {:join-alias (str "Question " id)}]]}]
                     :order-by [[:asc [:field (mt/id :venues :id) nil]]]
                     :limit 5})
             res (qp/process-query query)
             formatted (mt/formatted-rows [int str int double double int int double] res)]
         (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3 4 2.0]
                 [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 11 2.0]
                 [3 "The Apple Pan" 11 34.0406 -118.428 2 11 2.0]
                 [4 "Wurstküche" 29 33.9997 -118.465 2 29 2.0]
                 [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2 20 2.0]]
                formatted)))))
(testing "Percentile of joined percentile  is correct"
  (mt/dataset
   sample-dataset
   (mt/with-temp* [Card [{c1-id :id}
                         {:dataset_query
                          (mt/mbql-query
                           venues
                           {:source-table (mt/id :orders),
                            :aggregation
                            [[:aggregation-options [:percentile [:field (mt/id :orders :total) nil] 0.5] 
                              {:name "p50 total", :display-name "p50 total"}]]
                            :breakout [[:field (mt/id :orders :user_id) nil]],
                            :order-by [[:asc [:field (mt/id :orders :user_id) nil]]]})}]
                   Card [{c2-id :id}
                         {:dataset_query
                          (mt/mbql-query
                           venues
                           {:source-table (mt/id :orders),
                            :aggregation
                            [[:aggregation-options
                              [:percentile
                               [:field "p50 total" {:base-type :type/Float,
                                                    :join-alias (str "Question " c1-id)}]
                               0.8]
                              {:name "p80 of p50 total", :display-name "p80 of p50 total"}]],
                            :breakout [[:field (mt/id :orders :product_id) nil]],
                            :order-by [[:asc [:field (mt/id :orders :product_id) nil]]],
                            :joins
                            [{:alias (str "Question " c1-id)
                              :strategy :left-join,
                              :fields
                              [[:field (mt/id :orders :user_id) {:join-alias (str "Question " c1-id)}]
                               [:field "p50 total" {:base-type :type/Float, :join-alias (str "Question " c1-id)}]],
                              :condition [:=
                                          [:field (mt/id :orders :user_id) nil]
                                          [:field (mt/id :orders :user_id)
                                           {:join-alias (str "Question " c1-id)}]],
                              :source-table (str "card__" c1-id)}]})}]]
     (let [query (mt/mbql-query
                  orders
                  {:source-table (mt/id :orders),
                   :aggregation
                   [[:aggregation-options
                     [:percentile [:field "p80 of p50 total" {:base-type :type/Float, :join-alias (str "Question " c2-id)}] 0.2]
                     {:name "p20 of p80 of p50 of total", :display-name "p20 of p80 of p50 of total"}]],
                   :breakout [[:field (mt/id :orders :tax) nil]],
                   :order-by [[:asc [:field (mt/id :orders :tax) nil]]],
                   :limit 5
                   :joins
                   [{:alias (str "Question " c2-id),
                     :strategy :left-join,
                     :fields
                     [[:field (mt/id :orders :product_id) {:join-alias (str "Question " c2-id)}]
                      [:field "p80 of p50 total" {:base-type :type/Integer, :join-alias (str "Question " c2-id)}]],
                     :condition [:=
                                 [:field (mt/id :orders :product_id) nil]
                                 [:field (mt/id :orders :product_id) {:join-alias (str "Question " c2-id)}]],
                     :source-table (str "card__" c2-id)}]})
           res (qp/process-query query)
           formatted (mt/formatted-rows [double double] res)
          ;;  formatted (mt/rows res)
           ]
       (is (= [[0.0 81.28]
               [0.59 82.193]
               [0.62 78.622]
               [0.63 81.42]
               [0.65 82.25800000000001]]
              formatted))))))))

(comment
  (mt/set-test-drivers! [:sqlserver :postgres])
  (metabase.test-runner/run [#'metabase.driver.sqlserver-test/percentile-aggregations-with-card-test])
  )

(deftest percentile-aggregations-with-joins-test
  (mt/test-driver
   :sqlserver
   (testing "median on expression computed on joined column"
     (let [query (mt/mbql-query
                  venues
                  {:expressions {"latitude * user id"
                                 [:*
                                  [:field (mt/id :venues :latitude) nil]
                                  [:field (mt/id :users :id) {:join-alias "Users"}]]}
                   :aggregation [[:aggregation-options
                                  [:percentile [:expression "latitude * user id"] 0.5]
                                  {:name "median of latitude"}]]
                   :breakout [[:field (mt/id :users :id) {:join-alias "Users"}]
                              [:field (mt/id :users :name) {:join-alias "Users"}]]
                   :order-by [[:asc [:field (mt/id :users :id) {:join-alias "Users"}]]]
                   :limit 5
                   :joins
                   [{:alias "Checkins",
                     :strategy :left-join,
                     :fields [[:field (mt/id :checkins :date)
                               {:join-alias "Checkins", :temporal-unit :default}]],
                     :source-table (mt/id :checkins),
                     :condition [:=
                                 [:field (mt/id :venues :id) nil]
                                 [:field (mt/id :checkins :venue_id) {:join-alias "Checkins"}]]}
                    {:alias "Users",
                     :strategy :left-join,
                     :fields
                     [[:field (mt/id :users :id) {:join-alias "Users"}]
                      [:field (mt/id :users :name) {:join-alias "Users"}]
                      [:field (mt/id :users :last_login) {:temporal-unit :default, :join-alias "Users"}]],
                     :source-table (mt/id :users),
                     :condition [:=
                                 [:field (mt/id :checkins :user_id) {:join-alias "Checkins"}]
                                 [:field (mt/id :users :id) {:join-alias "Users"}]]}
                    {:alias "Categories",
                     :strategy :left-join,
                     :fields [[:field (mt/id :categories :id) {:join-alias "Categories"}]
                              [:field (mt/id :categories :name) {:join-alias "Categories"}]],
                     :source-table (mt/id :categories)
                     :condition [:=
                                 [:field (mt/id :venues :category_id) nil]
                                 [:field (mt/id :categories :id) {:join-alias "Categories"}]]}]})
           res (qp/process-query query)
           formatted (mt/formatted-rows [int str double double] res)]
       (is (= [[1 "Plato Yeshua" 34.1505]
               [2 "Felipinho Asklepios" 68.2508]
               [3 "Kaneonuskatew Eiran" 102.45150000000001]
               [4 "Simcha Yan" 136.6864]
               [5 "Quentin Sören" 170.522]]
              formatted))))))

(comment
  (mt/set-test-drivers! [:sqlserver :postgres])
  (metabase.test-runner/run [#'metabase.driver.sqlserver-test/percentile-aggregations-with-joins-test])
  )

(deftest nested-percentile-aggregations-test
  (testing "Compute percentile of percentile of percentile aggregation"
    (mt/test-driver
     :sqlserver
     (mt/dataset
      sample-dataset
      (as-> (mt/run-mbql-query
             orders
             {:aggregation
              [[:aggregation-options
                [:percentile [:field "median of median of total" {:base-type :type/Float}] 0.5]
                {:name "median of median of median of total" :display-name "median of median of median of total"}]]
              :breakout [[:field (mt/id :orders :subtotal) {:join-alias "Orders - Product"}]]
              :limit 5
              :order-by [[:asc [:field (mt/id :orders :subtotal) {:join-alias "Orders - Product"}]]]
              :joins
              [{:alias "Orders - Product"
                :strategy :inner-join
                :fields
                [[:field (mt/id :orders :id) {:join-alias "Orders - Product"}]
                 [:field (mt/id :orders :user_id) {:join-alias "Orders - Product"}]
                 [:field (mt/id :orders :product_id) {:join-alias "Orders - Product"}]
                 [:field (mt/id :orders :subtotal) {:join-alias "Orders - Product"}]
                 [:field (mt/id :orders :tax) {:join-alias "Orders - Product"}]
                 [:field (mt/id :orders :total) {:join-alias "Orders - Product"}]
                 [:field (mt/id :orders :discount) {:join-alias "Orders - Product"}]
                 [:field (mt/id :orders :created_at) {:temporal-unit :default :join-alias "Orders - Product"}]
                 [:field (mt/id :orders :quantity) {:join-alias "Orders - Product"}]]
                :source-table (mt/id :orders)
                :condition [:=
                            [:field (mt/id :orders :product_id) {:join-alias "Orders - User"}]
                            [:field (mt/id :orders :product_id) {:join-alias "Orders - Product"}]]}]
              :source-query
              {:aggregation
               [[:aggregation-options
                 [:percentile [:field "median of total" {:base-type :type/Float}] 0.5]
                 {:name "median of median of total" :display-name "median of median of total"}]]
               :breakout [[:field (mt/id :orders :product_id) {:join-alias "Orders - User"}]]
               :order-by [[:asc [:field (mt/id :orders :product_id) {:join-alias "Orders - User"}]]]
               :joins
               [{:alias "Orders - User"
                 :strategy :inner-join
                 :fields
                 [[:field (mt/id :orders :id) {:join-alias "Orders - Product"}]
                  [:field (mt/id :orders :user_id) {:join-alias "Orders - Product"}]
                  [:field (mt/id :orders :product_id) {:join-alias "Orders - Product"}]
                  [:field (mt/id :orders :subtotal) {:join-alias "Orders - Product"}]
                  [:field (mt/id :orders :tax) {:join-alias "Orders - Product"}]
                  [:field (mt/id :orders :total) {:join-alias "Orders - Product"}]
                  [:field (mt/id :orders :discount) {:join-alias "Orders - Product"}]
                  [:field (mt/id :orders :created_at) {:temporal-unit :default :join-alias "Orders - Product"}]
                  [:field (mt/id :orders :quantity) {:join-alias "Orders - Product"}]]
                 :source-table (mt/id :orders)
                 :condition [:=
                             [:field (mt/id :orders :user_id) {}]
                             [:field (mt/id :orders :user_id) {:join-alias "Orders - User"}]]}]
               :source-query
               {:source-table (mt/id :orders)
                :aggregation
                [[:aggregation-options
                  [:percentile [:field (mt/id :orders :total) nil] 0.5]
                  {:name "median of total" :display-name "median of total"}]]
                :breakout [[:field (mt/id :orders :user_id) nil]]
                :order-by [[:asc [:field (mt/id :orders :user_id) nil]]]}}})
            result
        (mt/formatted-rows [double double] result)
        (is (= [[15.69 72.945]
                [19.87 72.8725]
                [20.41 72.76]
                [21.42 71.49000000000001]
                [22.38 72.85]]
               result)))))))

(comment
  (mt/set-test-drivers! [:sqlserver :postgres])
  (metabase.test-runner/run [#'metabase.driver.sqlserver-test/nested-percentile-aggregations-test])
  )

(deftest percentile-aggregations-with-expressions-test
  (mt/test-driver
   :sqlserver
   (mt/dataset
    sample-dataset
    (testing "Compute percentile aggregation with different aggregation over same breakout"
     (as-> (mt/run-mbql-query
            orders
            {:source-table (mt/id :orders),
             :aggregation
             [[:aggregation-options [:avg [:field (mt/id :orders :total) nil]] {:name "avg"}]
              [:aggregation-options
               [:percentile [:field (mt/id :orders :subtotal) nil] 0.5]
               {:name "percentile of subtotal", :display-name "percentile of subtotal"}]],
             :breakout [[:field (mt/id :orders :user_id) nil]],
             :order-by [[:asc [:field (mt/id :orders :user_id) nil]]]
             :limit 5})
           result
       (mt/formatted-rows [int #(u/round-to-decimals 6 %) #(u/round-to-decimals 6 %)] result)
       (is (= [[1 81.827273 77.4]
               [3 100.306 107.21]
               [4 63.305 51.29]
               [5 103.65 99.66]
               [6 90.13 93.185]]
              result)))))))

(comment
  (mt/set-test-drivers! [:sqlserver :postgres])
  (metabase.test-runner/run [#'metabase.driver.sqlserver-test/percentile-aggregations-with-expressions-test])
  )

(deftest expression-in-breakout-test
  (mt/test-driver
   :sqlserver
   (mt/dataset
    sample-dataset
    (as-> (mt/run-mbql-query
           orders
           {:expressions {"total + subtotal"
                           [:+
                            [:field (mt/id :orders :total) nil]
                            [:field (mt/id :orders :subtotal) nil]]
                           "total * subtotal"
                           [:*
                            [:field (mt/id :orders :total) nil]
                            [:field (mt/id :orders :subtotal) nil]]
                           "rating * quantity"
                           [:*
                            [:field (mt/id :orders :quantity) nil]
                            [:field (mt/id :products :rating) {:join-alias "Products"}]]}
            :aggregation [[:aggregation-options [:percentile [:expression "total + subtotal" nil] 0.5]
                           {:name "p50 total * subtotal"}]
                          [:aggregation-options [:count [:field (mt/id :orders :total)]]
                           {:name "p50 total"}]
                          [:aggregation-options [:percentile [:field (mt/id :orders :total)] 0.5]
                           {:name "p50 total"}]]
            :breakout [#_[:field (mt/id :products :ean) nil]
                       [:expression "rating * quantity" nil]]
            :joins [{:alias "Products"
                     :source-table (mt/id :products)
                     :strategy :inner-join
                     :condition [:=
                                 [:field (mt/id :products :id) {:join-alias "Products"}]
                                 [:field (mt/id :orders :product_id) nil]]}]
            :order-by [[:asc [:expression "rating * quantity" nil]]]
            :limit 5})
          result
          (mt/formatted-rows [double double int double] result)
          #_(mt/rows result)
          (is (= #_[["0001664425970" 0.0 152.34 1 77.26]
                  ["0006590063715" 0.0 137.47 1 70.82]
                  ["0010465925138" 0.0 139.395 76 71.275]
                  ["0038948983000" 0.0 191.22 1 97.94]
                  ["0212722801067" 0.0 223.87 2 113.39]]
                 [[0.0 140.67000000000002 2368 72.38]
                    [2.0 228.79000000000002 28 117.86]
                    [2.5 78.22 21 39.92]
                    [2.7 160.55 27 81.85]
                    [3.0 221.98 43 110.99]]
                 result))))))

(comment
  (mt/set-test-drivers! [:sqlserver :postgres])
  (metabase.test-runner/run [#'metabase.driver.sqlserver-test/expression-in-breakout-test])
  )








