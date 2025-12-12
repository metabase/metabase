(ns ^:mb/driver-tests metabase.driver.mongo.query-processor-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.mongo.query-processor :as mongo.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.alternative-date-test :as qp.alternative-date-test]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.date-time-zone-functions-test :as qp.datetime-test]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest ^:parallel query->collection-name-test
  (testing "query->collection-name"
    (testing "should be able to extract :collection from :source-query")
    (is (= "checkins"
           (#'mongo.qp/query->collection-name {:query {:source-query
                                                       {:collection "checkins"
                                                        :native     []}}})))
    (testing "should work for nested-nested queries"
      (is (= "checkins"
             (#'mongo.qp/query->collection-name {:query {:source-query {:source-query
                                                                        {:collection "checkins"
                                                                         :native     []}}}}))))
    (testing "should ignore :joins"
      (is (= nil
             (#'mongo.qp/query->collection-name {:query {:source-query
                                                         {:native []}
                                                         :joins [{:source-query "wow"}]}}))))))

(deftest ^:parallel order-postprocessing-test
  (is (= [{"expression_2~share" {"$divide" ["$count-where-141638" "$count-141639"]}}
          {"expression" {"$add" ["$expression~count" {"$multiply" ["$expression~count" "$expression~sum"]}]}
           "expression_2" {"$multiply" [2 "$expression_2~share"]}}]
         (#'mongo.qp/order-postprocessing
          [[{} {"expression" {"$add" ["$expression~count" {"$multiply" ["$expression~count" "$expression~sum"]}]}}]
           [{}]
           [{}]
           [{"expression_2~share" {"$divide" ["$count-where-141638" "$count-141639"]}}
            {"expression_2" {"$multiply" [2 "$expression_2~share"]}}]]))))

(deftest ^:parallel relative-datetime-test
  (mt/test-driver :mongo
    (testing "Make sure relative datetimes are compiled sensibly"
      (mt/with-clock #t "2021-02-17T10:36:00-08:00[US/Pacific]"
        (mt/dataset attempted-murders
          (is (= {:projections ["count"]
                  :query       [{"$match"
                                 {"$and"
                                  [{"$expr" {"$gte" ["$datetime" {:$dateFromString {:dateString "2021-01-01T00:00Z"}}]}}
                                   {"$expr" {"$lt" ["$datetime" {:$dateFromString {:dateString "2021-02-01T00:00Z"}}]}}]}}
                                {"$group" {"_id" nil, "count" {"$sum" 1}}}
                                {"$sort" {"_id" 1}}
                                {"$project" {"_id" false, "count" true}}]
                  :collection  "attempts"
                  :mbql?       true}
                 (qp.compile/compile
                  (mt/mbql-query attempts
                    {:aggregation [[:count]]
                     :filter      [:time-interval $datetime :last :month]})))))))))

(deftest ^:parallel absolute-datetime-test
  (mt/test-driver :mongo
    (mt/with-metadata-provider (mt/id)
      (testing "Make sure absolute-datetime are compiled correctly"
        (doseq [[expected date]
                [["2014-01-01"        (t/local-date "2014-01-01")]
                 ["10:00"             (t/local-time "10:00:00")]
                 ["2014-01-01T10:00"  (t/local-date-time "2014-01-01T10:00")]
                 ["03:00Z"            (t/offset-time "10:00:00+07:00")]
                 ["2014-01-01T03:00Z" (t/offset-date-time "2014-01-01T10:00+07:00")]
                 ["2014-01-01T00:00Z" (t/zoned-date-time "2014-01-01T07:00:00+07:00[Asia/Ho_Chi_Minh]")]]]
          (testing (format "with %s" (type date))
            (is (= {"$expr" {"$lt" ["$date-field" {:$dateFromString {:dateString expected}}]}}
                   (mongo.qp/compile-filter [:<
                                             [:field "date-field"]
                                             [:absolute-datetime date]])))))))))

(defn- date-arithmetic-supported? []
  (driver/database-supports? :mongo :date-arithmetics (mt/db)))

(deftest ^:parallel no-initial-projection-test
  (mt/test-driver :mongo
    (testing "Don't need to create initial projections anymore (#4216)"
      (testing "Don't create an initial projection for datetime-fields that use `:default` bucketing (#14838)"
        (mt/with-clock #t "2021-02-15T17:33:00-08:00[US/Pacific]"
          (mt/dataset attempted-murders
            (is (= {:projections ["count"]
                    :query       [{"$match"
                                   {"$and"
                                    [{"$expr" {"$gte" ["$datetime" {:$dateFromString {:dateString "2021-01-01T00:00Z"}}]}}
                                     {"$expr" {"$lt" ["$datetime" {:$dateFromString {:dateString "2021-02-01T00:00Z"}}]}}]}}
                                  {"$group" {"_id" nil, "count" {"$sum" 1}}}
                                  {"$sort" {"_id" 1}}
                                  {"$project" {"_id" false, "count" true}}]
                    :collection  "attempts"
                    :mbql?       true}
                   (qp.compile/compile
                    (mt/mbql-query attempts
                      {:aggregation [[:count]]
                       :filter      [:time-interval $datetime :last :month]}))))))))))

(deftest ^:parallel no-initial-projection-test-2
  (mt/test-driver :mongo
    (testing "Don't need to create initial projections anymore (#4216)"
      (testing "Don't create an initial projection for datetime-fields that use `:default` bucketing (#14838)"
        (mt/with-clock #t "2021-02-15T17:33:00-08:00[US/Pacific]"
          (mt/dataset attempted-murders
            (testing "should still work even with bucketing bucketing"
              (let [tz    (qp.timezone/results-timezone-id :mongo (mt/db))
                    query (mt/with-metadata-provider (mt/id)
                            (qp.compile/compile
                             (mt/mbql-query attempts
                               {:aggregation [[:count]]
                                :breakout    [[:field %datetime {:temporal-unit :month}]
                                              [:field %datetime {:temporal-unit :day}]]
                                :filter      [:= [:field %datetime {:temporal-unit :month}] [:relative-datetime -1 :month]]})))]
                (is (= {:projections ["datetime" "datetime_2" "count"]
                        :query       [{"$match"
                                       {"$and"
                                        [{"$expr" {"$gte" ["$datetime" {:$dateFromString {:dateString "2021-01-01T00:00Z"}}]}}
                                         {"$expr" {"$lt" ["$datetime" {:$dateFromString {:dateString "2021-02-01T00:00Z"}}]}}]}}
                                      {"$group" {"_id"   (if (date-arithmetic-supported?)
                                                           {"datetime"   {:$dateTrunc {:date        "$datetime"
                                                                                       :startOfWeek "sunday"
                                                                                       :timezone    tz
                                                                                       :unit        "month"}}
                                                            "datetime_2" {:$dateTrunc {:date        "$datetime"
                                                                                       :startOfWeek "sunday"
                                                                                       :timezone    tz
                                                                                       :unit        "day"}}}
                                                           {"datetime"   {:$let {:vars {:parts {:$dateToParts {:date     "$datetime"
                                                                                                               :timezone tz}}}
                                                                                 :in   {:$dateFromParts {:year     "$$parts.year"
                                                                                                         :month    "$$parts.month"
                                                                                                         :timezone tz}}}}
                                                            "datetime_2" {:$let {:vars {:parts {:$dateToParts {:date     "$datetime"
                                                                                                               :timezone tz}}}
                                                                                 :in   {:$dateFromParts {:year     "$$parts.year"
                                                                                                         :month    "$$parts.month"
                                                                                                         :day      "$$parts.day"
                                                                                                         :timezone tz}}}}})
                                                 "count" {"$sum" 1}}}
                                      {"$sort" {"_id" 1}}
                                      {"$project" {"_id"        false
                                                   "datetime"   "$_id.datetime"
                                                   "datetime_2" "$_id.datetime_2"
                                                   "count"      true}}]
                        :collection  "attempts"
                        :mbql?       true}
                       query))
                (testing "Make sure we can actually run the query"
                  (is (=? {:status :completed}
                          (qp/process-query (mt/native-query query)))))))))))))

(deftest ^:parallel field-filter-relative-time-native-test
  (mt/test-driver :mongo
    (testing "Field filters with relative temporal constraints should work with native queries (#15945)"
      (mt/with-clock #t "2014-10-03T18:08:00Z"
        (let [query {:database (mt/id)
                     :native
                     {:collection "users"
                      :template-tags
                      {:date
                       {:id "2d7ce56a-2a66-5845-e9b9-e243c16965b8"
                        :name "last_login"
                        :display-name "Last Login"
                        :type "dimension"
                        :dimension ["field" (mt/id :users :last_login) nil]
                        :required true}}
                      :query "[{\"$match\": {{date}} },
                               {\"$project\": {\"name\": 1, \"last_login\": 1, \"_id\": 0} }]"}
                     :type "native"
                     :parameters
                     [{:type "date/all-options"
                       :value "past2hours"
                       :target ["dimension" ["template-tag" "date"]]
                       :id "2d7ce56a-2a66-5845-e9b9-e243c16965b8"}]
                     :middleware {:js-int-to-string? true}}]
          (is (= [["Quentin Sören" "2014-10-03T17:30:00Z"]]
                 (mt/rows (qp/process-query query)))))))))

(deftest ^:synchronized grouping-with-timezone-test
  (mt/test-driver :mongo
    (testing "Result timezone is respected when grouping by hour (#11149)"
      (mt/dataset attempted-murders
        (testing "Querying in UTC works"
          (mt/with-system-timezone-id! "UTC"
            (is (= [["2019-11-20T20:00:00Z" 1]
                    ["2019-11-19T00:00:00Z" 1]
                    ["2019-11-18T20:00:00Z" 1]
                    ["2019-11-17T14:00:00Z" 1]]
                   (mt/rows (mt/run-mbql-query attempts
                              {:aggregation [[:count]]
                               :breakout [[:field %datetime {:temporal-unit :hour}]]
                               :order-by [[:desc [:field %datetime {:temporal-unit :hour}]]]
                               :limit 4}))))))
        (testing "Querying in Kathmandu works"
          (mt/with-system-timezone-id! "Asia/Kathmandu"
            (is (= [["2019-11-21T01:00:00+05:45" 1]
                    ["2019-11-19T06:00:00+05:45" 1]
                    ["2019-11-19T02:00:00+05:45" 1]
                    ["2019-11-17T19:00:00+05:45" 1]]
                   (mt/rows (mt/run-mbql-query attempts
                              {:aggregation [[:count]]
                               :breakout [[:field %datetime {:temporal-unit :hour}]]
                               :order-by [[:desc [:field %datetime {:temporal-unit :hour}]]]
                               :limit 4}))))))))))

(deftest ^:parallel nested-columns-test
  (mt/test-driver :mongo
    (testing "Should generate correct queries against nested columns"
      (mt/dataset geographical-tips
        (mt/with-metadata-provider (mt/id)
          (is (= {:projections ["count"]
                  :query       [{"$match" {"source.username" "tupac"}}
                                {"$group" {"_id" nil, "count" {"$sum" 1}}}
                                {"$sort" {"_id" 1}}
                                {"$project" {"_id" false, "count" true}}],
                  :collection  "tips",
                  :mbql?       true}
                 (qp.compile/compile
                  (mt/mbql-query tips
                    {:aggregation [[:count]]
                     :filter      [:= $tips.source.username "tupac"]}))))

          (is (= {:projections ["source.username" "count"]
                  :query       [{"$group" {"_id"   {"source" {"username" "$source.username"}}
                                           "count" {"$sum" 1}}}
                                {"$sort" {"_id" 1}}
                                ;; Or should this be {"source" {"username" "$_id.source.username"}} ?
                                {"$project" {"_id" false, "source.username" "$_id.source.username", "count" true}}]
                  :collection  "tips"
                  :mbql?       true}
                 (qp.compile/compile
                  (mt/mbql-query tips
                    {:aggregation [[:count]]
                     :breakout    [$tips.source.username]}))))
          (testing "Nested fields in join condition aliases are transformed to use `_` instead of a `.` (#32182)"
            (let [query (mt/mbql-query tips
                          {:joins [{:alias "Tips"
                                    :source-table $$tips
                                    :condition [:= $tips.source.categories &Tips.$tips.source.categories]}]})
                  compiled (mongo.qp/mbql->native query)
                  let-lhs (-> compiled (get-in [:query 0 "$lookup" :let]) keys first)]
              (is (and (not (str/includes? let-lhs "."))
                       (str/includes? let-lhs "source_categories"))))))))))

(deftest ^:parallel multiple-distinct-count-test
  (mt/test-driver :mongo
    (testing "Should generate correct queries for multiple `:distinct` count aggregations (#13097)"
      (is (= {:projections ["count" "count_2"]
              :query
              [{"$group" {"_id" nil, "count" {"$addToSet" "$name"}, "count_2" {"$addToSet" "$price"}}}
               {"$addFields" {"count" {"$size" "$count"} "count_2" {"$size" "$count_2"}}}
               {"$sort" {"_id" 1}}
               {"$project" {"_id" false, "count" true, "count_2" true}}
               {"$limit" 5}],
              :collection  "venues"
              :mbql?       true}
             (qp.compile/compile
              (mt/mbql-query venues
                {:aggregation [[:distinct $name]
                               [:distinct $price]]
                 :limit       5})))))))

(deftest ^:parallel multiple-aggregations-with-distinct-count-expression-test
  (mt/test-driver
    :mongo
    (testing "Should generate correct queries for `:distinct` in expressions (#35425)"
      (is (= {:projections ["expression" "expression_2"],
              :query
              [{"$group"
                {"_id"                 nil,
                 "expression~count"    {"$addToSet" "$name"},
                 "expression~count1"   {"$addToSet" "$price"},
                 "expression_2~count"  {"$addToSet" "$name"},
                 "expression_2~count1" {"$addToSet" "$price"}}}
               {"$addFields"
                {"expression"   {"$add" [{"$size" "$expression~count"} {"$size" "$expression~count1"}]},
                 "expression_2" {"$subtract" [{"$size" "$expression_2~count"} {"$size" "$expression_2~count1"}]}}}
               {"$sort" {"_id" 1}}
               {"$project" {"_id" false, "expression" true, "expression_2" true}}
               {"$limit" 5}],
              :collection "venues",
              :mbql? true}
             (qp.compile/compile
              (mt/mbql-query venues
                {:aggregation [[:+ [:distinct $name] [:distinct $price]]
                               [:- [:distinct $name] [:distinct $price]]]
                 :limit       5})))))))

(defn- extract-projections [projections q]
  (select-keys (get-in q [:query 0 "$project"]) projections))

(deftest ^:parallel expressions-test
  (mt/test-driver :mongo
    (testing "Should be able to deal with expressions (#9382 is for BQ but we're doing it for mongo too)"
      (is (= {"bob" "$latitude", "cobb" "$name"}
             (extract-projections
              ["bob" "cobb"]
              (qp.compile/compile
               (mt/mbql-query venues
                 {:fields      [[:expression "bob"] [:expression "cobb"]]
                  :expressions {:bob   [:field $latitude nil]
                                :cobb [:field $name nil]}
                  :limit       5}))))))))

(deftest ^:parallel expressions-test-2
  (mt/test-driver :mongo
    (testing "Should be able to deal with 1-arity functions"
      (is (= {"cobb" {"$toUpper" "$name"},
              "bob" {"$abs" "$latitude"}}
             (extract-projections
              ["bob" "cobb"]
              (qp.compile/compile
               (mt/mbql-query venues
                 {:fields      [[:expression "bob"] [:expression "cobb"]]
                  :expressions {:bob   [:abs $latitude]
                                :cobb [:upper $name]}
                  :limit       5}))))))))

(deftest ^:parallel expressions-test-3
  (mt/test-driver :mongo
    (testing "Should be able to deal with 2-arity functions"
      (is (= {"bob" {"$add" ["$price" 300]}}
             (extract-projections
              ["bob"]
              (qp.compile/compile
               (mt/mbql-query venues
                 {:fields      [[:expression "bob"]]
                  :expressions {:bob   [:+ $price 300]}
                  :limit       5}))))))))

(deftest ^:parallel expressions-test-4
  (mt/test-driver :mongo
    (testing "Should be able to deal with a little indirection"
      (is (= {"bob" {"$abs" {"$subtract" ["$price" 300]}}}
             (extract-projections
              ["bob"]
              (qp.compile/compile
               (mt/mbql-query venues
                 {:fields      [[:expression "bob"]]
                  :expressions {:bob   [:abs [:- $price 300]]}
                  :limit       5}))))))))

(deftest ^:parallel expressions-test-5
  (mt/test-driver :mongo
    (testing "Should be able to deal with a little indirection, with an expression in"
      (is (= {"bob" {"$abs" "$latitude"},
              "cobb" {"$ceil" {"$abs" "$latitude"}}}
             (extract-projections
              ["bob" "cobb"]
              (qp.compile/compile
               (mt/mbql-query venues
                 {:fields      [[:expression "bob"] [:expression "cobb"]]
                  :expressions {:bob  [:abs $latitude]
                                :cobb [:ceil [:expression "bob"]]}
                  :limit       5}))))))))

(deftest ^:parallel expressions-test-6
  (mt/test-driver :mongo
    (testing "Should be able to deal with coalescing"
      (is (= {"bob" {"$ifNull" ["$latitude" "$price"]}}
             (extract-projections
              ["bob"]
              (qp.compile/compile
               (mt/mbql-query venues
                 {:expressions {:bob [:coalesce [:field $latitude nil] [:field $price nil]]}
                  :limit       5}))))))))

(deftest ^:parallel expressions-test-7
  (mt/test-driver :mongo
    (testing "Should be able to deal with group by expressions"
      (is (= {:collection "venues",
              :mbql? true,
              :projections ["asdf" "count"],
              :query [{"$group" {"_id" {"asdf" "$price"}, "count" {"$sum" 1}}}
                      {"$sort" {"_id" 1}}
                      {"$project" {"_id" false, "asdf" "$_id.asdf", "count" true}}]}
             (qp.compile/compile
              (mt/mbql-query venues
                {:expressions {:asdf ["field" $price nil]},
                 :aggregation [["count"]],
                 :breakout [["expression" "asdf"]]})))))))

(deftest ^:parallel compile-time-interval-test
  (mt/test-driver :mongo
    (testing "Make sure time-intervals work the way they're supposed to."
      (mt/with-clock #t "2021-02-17T10:36:00-08:00[US/Pacific]"
        (testing "[:time-interval $date -4 :month] should give us something like Oct 01 2020 - Feb 01 2021 if today is Feb 17 2021"
          (is (= [{"$match"
                   {"$and"
                    [{"$expr" {"$gte" ["$date" {:$dateFromString {:dateString "2020-10-01T00:00Z"}}]}}
                     {"$expr" {"$lt" ["$date" {:$dateFromString {:dateString "2021-02-01T00:00Z"}}]}}]}}
                  {"$group"
                   {"_id"
                    {"date"
                     (let [tz (qp.timezone/results-timezone-id :mongo (mt/db))]
                       (if (date-arithmetic-supported?)
                         {:$dateTrunc {:date "$date"
                                       :startOfWeek "sunday"
                                       :timezone tz
                                       :unit "day"}}
                         {:$let
                          {:vars {:parts {:$dateToParts {:date "$date"
                                                         :timezone tz}}}
                           :in   {:$dateFromParts {:year "$$parts.year"
                                                   :month "$$parts.month"
                                                   :day "$$parts.day"
                                                   :timezone tz}}}}))}}}
                  {"$sort" {"_id" 1}}
                  {"$project" {"_id" false, "date" "$_id.date"}}
                  {"$limit" 1048575}]
                 (:query
                  (qp.compile/compile
                   (mt/mbql-query checkins
                     {:filter   [:time-interval $date -4 :month]
                      :breakout [!day.date]}))))))))))

;;; TODO: I don't think MongoDB syncs its version, or at least we're not USING the synced version info. If we used it
;;; then we could use a mock Database here and parallelize this test.
(deftest ^:synchronized temporal-arithmetic-test
  (mt/test-driver :mongo
    (mt/with-metadata-provider (mt/id)
      (testing "Mixed integer and date arithmetic works with Mongo 5+"
        (with-redefs [mongo.qp/get-mongo-version (constantly {:version "5.2.13", :semantic-version [5 2 13]})]
          (mt/with-clock #t "2022-06-21T15:36:00+02:00[Europe/Berlin]"
            (is (= {"$expr"
                    {"$lt"
                     [{"$dateAdd"
                       {:startDate {"$add" [{"$dateAdd" {:startDate "$date-field"
                                                         :unit :year
                                                         :amount 1}}
                                            3600000]}
                        :unit :month
                        :amount -1}}
                      {"$subtract"
                       [{"$dateSubtract" {:startDate {:$dateFromString {:dateString "2008-05-31"}}
                                          :unit :week
                                          :amount -1}}
                        86400000]}]}}
                   (mongo.qp/compile-filter [:<
                                             [:+
                                              [:interval 1 :year]
                                              [:field "date-field"]
                                              3600000
                                              [:interval -1 :month]]
                                             [:-
                                              [:absolute-datetime (t/local-date "2008-05-31")]
                                              [:interval -1 :week]
                                              86400000]])))))))))

(deftest ^:synchronized temporal-arithmetic-mongo-4-test
  (mt/test-driver :mongo
    (mt/with-metadata-provider (mt/id)
      (testing "Date arithmetic fails with Mongo 4-"
        (with-redefs [mongo.qp/get-mongo-version (constantly {:version "4", :semantic-version [4]})]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Date arithmetic not supported in versions before 5"
               (mongo.qp/compile-filter [:<
                                         [:+
                                          [:interval 1 :year]
                                          [:field "date-field"]]
                                         [:absolute-datetime (t/local-date "2008-05-31")]]))))))))

(deftest ^:parallel datetime-math-tests
  (mt/test-driver :mongo
    (mt/dataset qp.datetime-test/times-mixed
      (mt/with-metadata-provider (mt/id)
        ;; date arithmetic doesn't supports until mongo 5+
        (when (driver/database-supports? :mongo :date-arithmetics (mt/db))
          (testing "date arithmetic with date columns"
            (let [[col-type field-id] [:date (mt/id :times :d)]]
              (doseq [op               [:datetime-add :datetime-subtract]
                      unit             [:year :quarter :month :day]
                      {:keys [expected query]}
                      [{:expected [(qp.datetime-test/datetime-math op #t "2004-03-19 00:00:00" 2 unit)
                                   (qp.datetime-test/datetime-math op #t "2008-06-20 00:00:00" 2 unit)
                                   (qp.datetime-test/datetime-math op #t "2012-11-21 00:00:00" 2 unit)
                                   (qp.datetime-test/datetime-math op #t "2012-11-21 00:00:00" 2 unit)]
                        :query   {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                                  :fields      [[:expression "expr"]]}}
                       {:expected (into [] (frequencies
                                            [(qp.datetime-test/datetime-math op #t "2004-03-19 00:00:00" 2 unit)
                                             (qp.datetime-test/datetime-math op #t "2008-06-20 00:00:00" 2 unit)
                                             (qp.datetime-test/datetime-math op #t "2012-11-21 00:00:00" 2 unit)
                                             (qp.datetime-test/datetime-math op #t "2012-11-21 00:00:00" 2 unit)]))
                        :query    {:expressions {"expr" [op [:field field-id nil] 2 unit]}
                                   :aggregation [[:count]]
                                   :breakout    [[:expression "expr"]]}}]]
                (testing (format "%s %s function works as expected on %s column for driver %s" op unit col-type driver/*driver*)
                  (is (= (set expected) (set (qp.datetime-test/test-datetime-math query)))))))))))))

(deftest ^:parallel expr-test
  (mt/test-driver
    :mongo
    (testing "Should use $expr for simple comparisons and ops for others"
      (are [x y] (partial= {:query [{"$match" x}]}
                           (qp.compile/compile (mt/mbql-query venues {:filter y})))
        {"price" 100}
        [:= $price 100]

        {"price" {"$ne" 100}}
        [:!= $price 100]

        {"price" {"$gt" 100}}
        [:> $price 100]

        {"price" {"$gte" 100}}
        [:>= $price 100]

        {"price" {"$lt" 100}}
        [:< $price 100]

        {"price" {"$lte" 100}}
        [:<= $price 100]

        {"$expr" {"$regexMatch" {"input" "$name" "regex" "hello" "options" ""}}}
        [:contains $name "hello"]

        {"$expr" {"$regexMatch" {"input" "$name" "regex" "hello" "options" ""}}}
        [:contains $name "hello" {:case-sensitive true}]

        {"$expr" {"$regexMatch" {"input" "$name" "regex" "hello" "options" "i"}}}
        [:contains $name "hello" {:case-sensitive false}]

        {"$expr" {"$regexMatch" {"input" "$name" "regex" "^hello" "options" ""}}}
        [:starts-with $name "hello"]

        {"$expr" {"$regexMatch" {"input" "$name"
                                 "regex" {"$concat" [{"$literal" "^"}
                                                     {"$substrCP" ["$name" {"$subtract" [1 1]} 3]}]}
                                 "options" ""}}}
        [:starts-with $name [:substring $name 1 3]]

        {"$expr" {"$regexMatch" {"input" "$name"
                                 "regex" {"$concat" ["$name"
                                                     {"$literal" "$"}]}
                                 "options" "i"}}}
        [:ends-with $name $name {:case-sensitive false}]

        {"$and" [{"$expr" {"$eq" ["$price" {"$add" ["$price" 1]}]}} {"name" "hello"}]}
        [:and [:= $price [:+ $price 1]] [:= $name "hello"]]

        {"$expr" {"$eq" ["$price" "$price"]}}
        [:= $price $price]

        {"$expr" {"$eq" [{"$add" ["$price" 1]} 100]}}
        [:= [:+ $price 1] 100]

        {"$expr" {"$eq" ["$price" {"$add" [{"$subtract" ["$price" 5]} 100]}]}}
        [:= $price [:+ [:- $price 5] 100]]))))

(deftest ^:parallel unique-alias-index-test
  (mt/test-driver
    :mongo
    (testing "Field aliases have deterministic unique indices"
      (let [query (mt/mbql-query
                    nil
                    {:joins [{:alias "Products"
                              :source-table $$products
                              :condition [:= &Products.products.id $orders.product_id]
                              :fields :all}
                             {:alias "People"
                              :source-table $$people
                              :condition [:= &People.people.id $orders.user_id]
                              :fields :all}]
                     :source-query {:source-table $$orders
                                    :joins [{:alias "Products"
                                             :source-table $$products
                                             :condition [:= &Products.products.id $orders.product_id]
                                             :fields :all}
                                            {:alias "People"
                                             :source-table $$people
                                             :condition [:= &People.people.id $orders.user_id]
                                             :fields :all}]}})
            compiled (qp.compile/compile query)
            indices (reduce (fn [acc lookup-stage]
                              (let [let-var-name (-> (get-in lookup-stage ["$lookup" :let]) keys first)
                                   ;; Following expression ensures index is an integer.
                                    index (parse-long (re-find #"\d+$" let-var-name))]
                               ;; Following expression tests that index is unique.
                                (is (not (contains? acc index)))
                                (conj acc index)))
                            #{}
                            (filter #(contains? % "$lookup") (:query compiled)))]
        (is (= #{1 2 3 4} indices))))))

(deftest ^:parallel parse-query-string-test
  (testing "`parse-query-string` returns no `Bson...` typed values  (#38181)"
    ;; ie. parse result does not look as follows: `#object[org.bson.BsonString 0x5f26b3a1 "BsonString{value='1000'}"]`
    (let [parsed (mongo.qp/parse-query-string "[{\"limit\": \"1000\"}]")]
      (is (not (instance? org.bson.BsonValue (get-in parsed [0 "limit"])))))))

(deftest ^:parallel parse-query-string-test-2
  (mt/test-driver :mongo
    (mt/dataset qp.alternative-date-test/string-times
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"MongoDB does not support parsing strings as dates. Try parsing to a datetime instead"
           (qp/process-query
            (mt/mbql-query times {:fields [$d]}))))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"MongoDB does not support parsing strings as times. Try parsing to a datetime instead"
           (qp/process-query
            (mt/mbql-query times {:fields [$t]})))))))

(deftest ^:parallel join-preserves-$$-variable-prefix-test
  (mt/test-driver :mongo
    (testing "$$variable references in join conditions are preserved when rhs is a literal value (QUE-1500)"
      (let [query (mt/mbql-query users
                    {:joins    [{:condition    [:and
                                                [:= $id &c.checkins.user_id]
                                                [:= $name [:value "Felipinho Asklepios" {:base_type :type/Text}]]]
                                 :source-table $$checkins
                                 :alias        "c"
                                 :fields       [&c.checkins.date]}]
                     :fields   [$id $name &c.checkins.date]
                     :order-by [[:asc $id]
                                [:asc &c.checkins.id]]
                     :limit    3})]
        (testing "qp.compile"
          (is (= [{"$lookup"
                   {:as "join_alias_c"
                    :from "checkins"
                    :let {"let__id___1" "$_id",
                          "let_name___2" "$name"}
                    :pipeline
                    [{"$project" {"_id" "$_id", "date" "$date", "user_id" "$user_id", "venue_id" "$venue_id"}}
                     {"$match"
                      {"$and" [{"$expr" {"$eq" ["$$let__id___1" "$user_id"]}}
                               {"$expr" {"$eq" ["$$let_name___2" "Felipinho Asklepios"]}}]}}]}}
                  {"$unwind" {:path "$join_alias_c"
                              :preserveNullAndEmptyArrays true}}
                  {"$sort" {"_id" 1
                            "join_alias_c._id" 1}}
                  {"$project" {"_id" "$_id"
                               "c__date" "$join_alias_c.date"
                               "name" "$name"}}
                  {"$limit" 3}]
                 (:query (qp.compile/compile query)))))
        (testing "qp.process-query"
          (is (= [[1 "Plato Yeshua" nil]
                  [2 "Felipinho Asklepios" "2013-11-19T00:00:00Z"]
                  [2 "Felipinho Asklepios" "2015-03-06T00:00:00Z"]]
                 (mt/rows (qp/process-query query)))))))))

(deftest ^:parallel mongo-multiple-joins-test
  (testing "should be able to join multiple mongo collections"
    (mt/test-driver :mongo
      (mt/dataset (mt/dataset-definition "multi-join-db"
                                         [["table_a"
                                           [{:field-name "a_id" :base-type :type/Text}
                                            {:field-name "b_id" :base-type :type/Text}]
                                           [["a_id" "b_id"]]]
                                          ["table_b"
                                           [{:field-name "b_id" :base-type :type/Text}
                                            {:field-name "c_id" :base-type :type/Text}]
                                           [["b_id" "c_id"]]]
                                          ["table_c"
                                           [{:field-name "c_id" :base-type :type/Text}]
                                           [["c_id"]]]])
        (let [mp (mt/metadata-provider)
              table-a (lib.metadata/table mp (mt/id :table_a))
              table-b (lib.metadata/table mp (mt/id :table_b))
              table-c (lib.metadata/table mp (mt/id :table_c))
              table-a-b-id (lib.metadata/field mp (mt/id :table_a :b_id))
              table-b-b-id (lib.metadata/field mp (mt/id :table_b :b_id))
              table-b-c-id (lib.metadata/field mp (mt/id :table_b :c_id))
              table-c-c-id (lib.metadata/field mp (mt/id :table_c :c_id))
              query (-> (lib/query mp table-a)
                        (lib/join (lib/join-clause table-b [(lib/= table-a-b-id  table-b-b-id)]))
                        (lib/join (lib/join-clause table-c [(lib/= table-b-c-id table-c-c-id)])))]
          (is (= [[1 "a_id" "b_id" 1 "b_id" "c_id" 1 "c_id"]]
                 (mt/rows (qp/process-query query)))))))))

;; TODO: Re-enable this test if it becomes possible to determine type/UUID without using JavaScript
#_(deftest ^:parallel filter-uuids-with-string-patterns-test
    (mt/test-driver :mongo
      (mt/dataset uuid-dogs
        (let [mp (mt/metadata-provider)
              dogs (lib.metadata/table mp (mt/id :dogs))
              person-id (lib.metadata/field mp (mt/id :dogs :person_id))]
          (if (-> (driver/dbms-version :mongo (mt/db)) :semantic-version (driver.u/semantic-version-gte [8]))
            (do
              (is (= [[1 #uuid "27e164bc-54f8-47a0-a85a-9f0e90dd7667" "Ivan" #uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]
                      [2 #uuid "3a0c0508-6b00-40ff-97f6-549666b2d16b" "Zach" #uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]]
                     (-> (lib/query mp dogs)
                         (lib/filter (lib/starts-with person-id "d6"))
                         qp/process-query
                         mt/rows)))
              (is (= [[3 #uuid "d6a82cf5-7dc9-48a3-a15d-61df91a6edeb" "Boss" #uuid "d39bbe77-4e2e-4b7b-8565-cce90c25c99b"]]
                     (-> (lib/query mp dogs)
                         (lib/filter (lib/ends-with person-id "9b"))
                         qp/process-query
                         mt/rows)))
              (is (= [[3 #uuid "d6a82cf5-7dc9-48a3-a15d-61df91a6edeb" "Boss" #uuid "d39bbe77-4e2e-4b7b-8565-cce90c25c99b"]]
                     (-> (lib/query mp dogs)
                         (lib/filter (lib/contains person-id "e"))
                         qp/process-query
                         mt/rows))))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"String searching on UUIDs is only supported in Mongo v8.0+"
                                  (-> (lib/query mp dogs)
                                      (lib/filter (lib/contains person-id "e"))
                                      qp/process-query))))))))

(deftest ^:parallel pivot-query-based-on-native-card-test
  (mt/test-driver :mongo
    (testing "Pivot queries based on a native Mongo card return the right number of columns (#64124)"
      (let [native-query (json/encode [{:$match {:_id 1}}
                                       {:$project {:product_id :$product_id, :subtotal :$subtotal}}])
            mp (lib.tu/mock-metadata-provider
                (mt/metadata-provider)
                {:cards [{:id              1
                          :name            "Orders native mongo"
                          :dataset-query   {:type     :native
                                            :native   {:collection "orders"
                                                       :query      native-query}
                                            :database (mt/id)}
                          :result_metadata [{:name         "product_id"
                                             :base_type    :type/Integer
                                             :display_name "product_id"}
                                            {:name         "subtotal"
                                             :base_type    :type/Float
                                             :display_name "subtotal"}]}]})
            breakout-by-column-name (fn [query col-name]
                                      (lib/breakout query (m/find-first (comp #{col-name} :name)
                                                                        (lib/breakoutable-columns query))))
            query (-> (lib/query mp (lib.metadata/card mp 1))
                      (lib/aggregate (lib/count))
                      (breakout-by-column-name "product_id")
                      (breakout-by-column-name "subtotal"))
            pivot-query (assoc query
                               :pivot_rows         [0]
                               :pivot_cols         [1]
                               :show_row_totals    true
                               :show_column_totals true
                               :info               {:context :ad-hoc})]
        (is (=? {:data
                 {:cols
                  [{:lib/desired-column-alias "product_id"
                    :field_ref                [:field "product_id" {:base-type :type/Integer}]
                    :base_type                :type/Integer
                    :effective_type           :type/Integer}
                   {:lib/desired-column-alias "subtotal"
                    :field_ref                [:field "subtotal" {:base-type :type/Float}]
                    :base_type                :type/Float
                    :effective_type           :type/Float}
                   {:lib/desired-column-alias "pivot-grouping"
                    :field_ref                [:expression "pivot-grouping"]
                    :base_type                :type/Integer
                    :effective_type           :type/Integer}
                   {:lib/desired-column-alias "count"
                    :field_ref                [:aggregation 0]
                    :base_type                :type/Integer
                    :semantic_type            :type/Quantity
                    :effective_type           :type/Integer}]
                  :rows [[14 37.65 0 1] [nil 37.65 1 1] [14 nil 2 1] [nil nil 3 1]]}}
                (qp.pivot/run-pivot-query pivot-query)))))))
