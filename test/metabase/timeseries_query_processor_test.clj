(ns metabase.timeseries-query-processor-test
  "Query processor tests for DBs that are event-based, like Druid.
  There architecture is different enough that we can't test them along with our 'normal' DBs in `query-procesor-test`."
  {:clj-kondo/config '{:hooks {:analyze-call {metabase.timeseries-query-processor-test/run-mbql-query
                                              hooks.metabase.test.data/mbql-query}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.data.mbql-query-impl :as mbql-query-impl]
   [metabase.timeseries-query-processor-test.util :as tqpt]
   [metabase.util.date-2 :as u.date]))

(defn- druid-id
  "Transform mt/id calls for `:timestamp` field to `:__time`. Reason being that `:druid` renames `:__time` to
   `:timestamp`. With this transform in place existing timeseries tests are usable also with `:druid-jdbc`."
  [& args]
  (if (and (> (count args) 1)
           (= :druid-jdbc driver/*driver*)
           (= "timestamp" (name (last args))))
    (apply mt/id (conj (vec (butlast args)) :__time))
    (apply mt/id args)))

(defn- time->timestamp-col [col]
  (cond-> col
    (= "__time" (:name col))
    (-> col
        (assoc :name "timestamp")
        (assoc :display_name "Timestamp"))))

(defn- adjust-result-cols
  "Transform column names in query results from `__time` to `timestamp`. With this transformation in place, existing
   timesries tests are usable for both `:druid` and `:druid-jdbc`."
  [result]
  (as-> result r
    (if (-> r :data :cols seq)
      (update-in r [:data :cols] (partial map time->timestamp-col))
      r)
    (if (-> r :data :results_metadata :columns seq)
      (update-in r [:data :results_metadata :columns] (partial mapv time->timestamp-col))
      r)))

(defmacro run-mbql-query
  "Wrapper for [[metabase.test/run-mbql-query]] with Druid specific pre and post processing transformations.
  `:druid` driver renames omnipresent `__time` column to `timestamp`, while `:druid-jdbc` handles the column as is.
   To overcome that, and having tests from this namespace usable for both timesries drivers, this macro does
   (1) renaming of `timestamp` column to `__time` for purposes of calls to [[mt/id]], by wrapping it to
   renaming function [[druid-id]] and (2) renames columns in result from `__time` to `timestamp` by means of
   [[adjust-result-cols]]."
  {:style/indent :defn}
  [table-sym inner-query-map]
  (let [result# (binding [mbql-query-impl/*id-fn-symb* `druid-id]
                  (walk/macroexpand-all `(mt/run-mbql-query ~table-sym ~inner-query-map)))]
    `(-> ~result#
         adjust-result-cols)))

(deftest ^:parallel limit-test
  (tqpt/test-timeseries-drivers
    (is (= {:columns
            ["timestamp"
             "venue_name"
             "venue_longitude"
             "venue_latitude"
             "venue_price"
             "venue_category_name"
             "id"
             "count"
             "unique_users"
             "user_name"
             "user_last_login"]

            :rows
            [["2013-01-03T00:00:00Z" "Kinaree Thai Bistro"       -118.344 34.094  1 "Thai" 931 1 "AQAAAQAAAAEBsA==" "Simcha Yan" "2014-01-01T08:30:00"]
             ["2013-01-10T00:00:00Z" "Ruen Pair Thai Restaurant" -118.306 34.1021 2 "Thai" 285 1 "AQAAAQAAAAP4IA==" "Kfir Caj"   "2014-07-03T01:30:00"]]}
           (mt/rows+column-names
             (run-mbql-query checkins
                             {:fields [$timestamp
                                       $venue_name
                                       $venue_longitude
                                       $venue_latitude
                                       $venue_price
                                       $venue_category_name
                                       $id
                                       $count
                                       $unique_users
                                       $user_name
                                       $user_last_login]
                              :limit 2}))))))

(deftest ^:parallel fields-test
  (tqpt/test-timeseries-drivers
    (is (= {:columns ["venue_name" "venue_category_name" "timestamp"],
            :rows    [["Kinaree Thai Bistro"        "Thai" "2013-01-03T00:00:00Z"]
                      ["Ruen Pair Thai Restaurant" "Thai"  "2013-01-10T00:00:00Z"]]}
           (mt/rows+column-names
            (run-mbql-query checkins
                            {:fields [$venue_name $venue_category_name $timestamp]
                             :limit  2}))))))

(deftest ^:parallel order-by-timestamp-test
  (tqpt/test-timeseries-drivers
    (testing "query w/o :fields"
      (doseq [[direction expected-rows]
              {:desc [["2015-12-29T00:00:00Z" "Señor Fish"                -118.238 34.0489 2 "Mexican"   693 1 "AQAAAQAAAAIFIA==" "Frans Hevel"    "2014-07-03T19:30:00"]
                      ["2015-12-26T00:00:00Z" "Empress of China"          -122.406 37.7949 3 "Chinese"   570 1 "AQAAAQAAAAP4IA==" "Kfir Caj"       "2014-07-03T01:30:00"]]
               :asc  [["2013-01-03T00:00:00Z" "Kinaree Thai Bistro"       -118.344 34.094  1 "Thai"      931 1 "AQAAAQAAAAEBsA==" "Simcha Yan"     "2014-01-01T08:30:00"]
                      ["2013-01-10T00:00:00Z" "Ruen Pair Thai Restaurant" -118.306 34.1021 2 "Thai"      285 1 "AQAAAQAAAAP4IA==" "Kfir Caj"       "2014-07-03T01:30:00"]]}]
        (testing direction
          (is (= {:columns ["timestamp"
                            "venue_name"
                            "venue_longitude"
                            "venue_latitude"
                            "venue_price"
                            "venue_category_name"
                            "id"
                            "count"
                            "unique_users"
                            "user_name"
                            "user_last_login"]
                  :rows    expected-rows}
                 (mt/rows+column-names
                  (run-mbql-query checkins
                                  {:fields [$timestamp
                                            $venue_name
                                            $venue_longitude
                                            $venue_latitude
                                            $venue_price
                                            $venue_category_name
                                            $id
                                            $count
                                            $unique_users
                                            $user_name
                                            $user_last_login]
                                   :order-by [[direction $timestamp]]
                                   :limit    2})))))))

    (testing "for a query with :fields"
      (doseq [[direction expected-rows] {:desc [["Señor Fish"                "Mexican"   "2015-12-29T00:00:00Z"]
                                                ["Empress of China"          "Chinese"   "2015-12-26T00:00:00Z"]]
                                         :asc  [["Kinaree Thai Bistro"       "Thai"      "2013-01-03T00:00:00Z"]
                                                ["Ruen Pair Thai Restaurant" "Thai"      "2013-01-10T00:00:00Z"]]}]
        (testing direction
          (is (= {:columns ["venue_name" "venue_category_name" "timestamp"]
                  :rows    expected-rows}
                 (mt/rows+column-names
                  (run-mbql-query checkins
                                  {:fields   [$venue_name $venue_category_name $timestamp]
                                   :order-by [[direction $timestamp]]
                                   :limit    2})))))))))

(deftest ^:parallel count-test
  (tqpt/test-timeseries-drivers
    (is (= [1000]
           (mt/first-row
             (run-mbql-query checkins
               {:aggregation [[:count]]}))))

    (testing "count of field"
      (is (= [1000]
             (mt/first-row
               (run-mbql-query checkins
                 {:aggregation [[:count $user_name]]})))))))

(deftest ^:parallel avg-test
  (tqpt/test-timeseries-drivers
    (is (= {:columns ["avg"]
            :rows    [[1.992]]}
           (mt/rows+column-names
             (run-mbql-query checkins
               {:aggregation [[:avg $venue_price]]}))))))

(deftest ^:parallel sum-test
  (tqpt/test-timeseries-drivers
    (is (= {:columns ["sum"]
            :rows    [[1992.0]]}
           (mt/formatted-rows+column-names
            [double]
            (run-mbql-query checkins
                               {:aggregation [[:sum $venue_price]]}))))))

(deftest ^:parallel avg-test-2
  (tqpt/test-timeseries-drivers
    (is (= {:columns ["avg"]
            :rows    [[1.992]]}
           (mt/formatted-rows+column-names
            [double]
            (run-mbql-query checkins
                               {:aggregation [[:avg $venue_price]]}))))))

(deftest ^:parallel distinct-count-test
  (tqpt/test-timeseries-drivers
    (is (= [[4]]
           (->> (run-mbql-query checkins
                  {:aggregation [[:distinct $venue_price]]})
                (mt/formatted-rows [int]))))))

(deftest ^:parallel breakout-test
  (tqpt/test-timeseries-drivers
    (testing "1 breakout (distinct values)"
      (is (= {:columns ["user_name"]
              :rows    [["Broen Olujimi"]
                        ["Conchúr Tihomir"]
                        ["Dwight Gresham"]
                        ["Felipinho Asklepios"]
                        ["Frans Hevel"]
                        ["Kaneonuskatew Eiran"]
                        ["Kfir Caj"]
                        ["Nils Gotam"]
                        ["Plato Yeshua"]
                        ["Quentin Sören"]
                        ["Rüstem Hebel"]
                        ["Shad Ferdynand"]
                        ["Simcha Yan"]
                        ["Spiros Teofil"]
                        ["Szymon Theutrich"]]}
             (mt/rows+column-names
              (run-mbql-query checkins
                              {:breakout [$user_name]})))))

    (testing "2 breakouts"
      (is (= {:columns ["user_name" "venue_category_name"]
              :rows    [["Broen Olujimi" "American"]
                        ["Broen Olujimi" "Artisan"]
                        ["Broen Olujimi" "BBQ"]
                        ["Broen Olujimi" "Bakery"]
                        ["Broen Olujimi" "Bar"]
                        ["Broen Olujimi" "Burger"]
                        ["Broen Olujimi" "Café"]
                        ["Broen Olujimi" "Caribbean"]
                        ["Broen Olujimi" "Deli"]
                        ["Broen Olujimi" "Dim Sum"]]}
             (mt/rows+column-names
              (run-mbql-query checkins
                              {:breakout [$user_name $venue_category_name]
                               :limit    10})))))))

(deftest ^:parallel breakout-order-by-test
  (tqpt/test-timeseries-drivers
    (testing "1 breakout w/ explicit order by"
      (is (= {:columns ["user_name"]
              :rows    [["Szymon Theutrich"]
                        ["Spiros Teofil"]
                        ["Simcha Yan"]
                        ["Shad Ferdynand"]
                        ["Rüstem Hebel"]
                        ["Quentin Sören"]
                        ["Plato Yeshua"]
                        ["Nils Gotam"]
                        ["Kfir Caj"]
                        ["Kaneonuskatew Eiran"]]}
             (mt/rows+column-names
              (run-mbql-query checkins
                              {:breakout [$user_name]
                               :order-by [[:desc $user_name]]
                               :limit    10})))))

    (testing "2 breakouts w/ explicit order by"
      (is (= {:columns ["user_name" "venue_category_name"]
              :rows    [["Broen Olujimi"       "American"]
                        ["Conchúr Tihomir"     "American"]
                        ["Dwight Gresham"      "American"]
                        ["Felipinho Asklepios" "American"]
                        ["Frans Hevel"         "American"]
                        ["Kaneonuskatew Eiran" "American"]
                        ["Kfir Caj"            "American"]
                        ["Nils Gotam"          "American"]
                        ["Plato Yeshua"        "American"]
                        ["Quentin Sören"       "American"]]}
             (mt/rows+column-names
              (run-mbql-query checkins
                              {:breakout [$user_name $venue_category_name]
                               :order-by [[:asc $venue_category_name]]
                               :limit    10})))))))

(deftest ^:parallel count-with-breakout-test
  (tqpt/test-timeseries-drivers
    (testing "count w/ 1 breakout"
      (is (= {:columns ["user_name" "count"]
              :rows    [["Broen Olujimi"       62]
                        ["Conchúr Tihomir"     76]
                        ["Dwight Gresham"      76]
                        ["Felipinho Asklepios" 70]
                        ["Frans Hevel"         78]
                        ["Kaneonuskatew Eiran" 75]
                        ["Kfir Caj"            59]
                        ["Nils Gotam"          68]
                        ["Plato Yeshua"        31]
                        ["Quentin Sören"       69]
                        ["Rüstem Hebel"        34]
                        ["Shad Ferdynand"      70]
                        ["Simcha Yan"          77]
                        ["Spiros Teofil"       74]
                        ["Szymon Theutrich"    81]]}
             (mt/rows+column-names
              (run-mbql-query checkins
                              {:aggregation [[:count]]
                               :breakout    [$user_name]})))))

    (testing "count w/ 2 breakouts"
      (is (= {:columns ["user_name" "venue_category_name" "count"]
              :rows    [["Broen Olujimi" "American"  8]
                        ["Broen Olujimi" "Artisan"   1]
                        ["Broen Olujimi" "BBQ"       7]
                        ["Broen Olujimi" "Bakery"    2]
                        ["Broen Olujimi" "Bar"       5]
                        ["Broen Olujimi" "Burger"    2]
                        ["Broen Olujimi" "Café"      1]
                        ["Broen Olujimi" "Caribbean" 1]
                        ["Broen Olujimi" "Deli"      2]
                        ["Broen Olujimi" "Dim Sum"   2]]}
             (mt/rows+column-names
              (run-mbql-query checkins
                              {:aggregation [[:count]]
                               :breakout    [$user_name $venue_category_name]
                               :limit       10})))))))

(deftest ^:parallel comparison-filter-test
  (tqpt/test-timeseries-drivers
    (testing "filter >"
      (is (= [49]
             (mt/first-row
              (run-mbql-query checkins
                              {:aggregation [[:count]]
                               :filter      [:> $venue_price 3]})))))

    (testing "filter <"
      (is (= [836]
             (mt/first-row
               (run-mbql-query checkins
                               {:aggregation [[:count]]
                                :filter      [:< $venue_price 3]})))))

    (testing "filter >="
      (is (= [164]
             (mt/first-row
               (run-mbql-query checkins
                               {:aggregation [[:count]]
                                :filter      [:>= $venue_price 3]})))))

    (testing "filter <="
      (is (= [951]
             (mt/first-row
               (run-mbql-query checkins
                               {:aggregation [[:count]]
                                :filter      [:<= $venue_price 3]})))))))

(deftest ^:parallel equality-filter-test
  (tqpt/test-timeseries-drivers
    (testing "filter ="
      (is (= {:columns ["user_name" "venue_name" "venue_category_name" "timestamp"]
              :rows    [["Plato Yeshua" "Fred 62"        "Diner"    "2013-03-12T00:00:00Z"]
                        ["Plato Yeshua" "Dimples"        "Karaoke"  "2013-04-11T00:00:00Z"]
                        ["Plato Yeshua" "Baby Blues BBQ" "BBQ"      "2013-06-03T00:00:00Z"]
                        ["Plato Yeshua" "The Daily Pint" "Bar"      "2013-07-25T00:00:00Z"]
                        ["Plato Yeshua" "Marlowe"        "American" "2013-09-10T00:00:00Z"]]}
             (mt/rows+column-names
              (run-mbql-query checkins
                              {:fields [$user_name $venue_name $venue_category_name $timestamp]
                               :filter [:= $user_name "Plato Yeshua"]
                               :limit  5})))))

    (testing "filter !="
      (is (= [969]
             (mt/first-row
               (run-mbql-query checkins
                               {:aggregation [[:count]]
                                :filter      [:!= $user_name "Plato Yeshua"]})))))))

(deftest ^:parallel compound-filter-test
  (tqpt/test-timeseries-drivers
    (testing "filter AND"
      (is (= {:columns ["user_name" "venue_name" "timestamp"]
              :rows    [["Plato Yeshua" "The Daily Pint" "2013-07-25T00:00:00Z"]]}
             (mt/rows+column-names
               (run-mbql-query checkins
                               {:fields [$user_name $venue_name $timestamp]
                                :filter [:and
                                         [:= $venue_category_name "Bar"]
                                         [:= $user_name "Plato Yeshua"]]})))))

    (testing "filter OR"
      (is (= [199]
             (mt/first-row
               (run-mbql-query checkins
                               {:aggregation [[:count]]
                                :filter      [:or
                                              [:= $venue_category_name "Bar"]
                                              [:= $venue_category_name "American"]]})))))))

(deftest ^:parallel between-filter-test
  (tqpt/test-timeseries-drivers
    (testing "filter BETWEEN (inclusive)"
      (is (= [951]
             (mt/first-row
              (run-mbql-query checkins
                              {:aggregation [[:count]]
                               :filter      [:between $venue_price 1 3]})))))))

(deftest ^:parallel inside-filter-test
  (tqpt/test-timeseries-drivers
    (is (= {:columns ["venue_name"]
            :rows    [["Red Medicine"]]}
           (mt/rows+column-names
            (run-mbql-query
             checkins
             {:breakout [$venue_name]
              :filter   [:inside $venue_latitude $venue_longitude 10.0649 -165.379 10.0641 -165.371]}))))))

(deftest ^:parallel is-null-filter-test
  (tqpt/test-timeseries-drivers
    (is (= [0]
           (mt/first-row
            (run-mbql-query checkins
                            {:aggregation [[:count]]
                             :filter      [:is-null $venue_category_name]}))))))

(deftest ^:parallel not-null-filter-test
  (tqpt/test-timeseries-drivers
    (is (= [1000]
           (mt/first-row
            (run-mbql-query checkins
                            {:aggregation [[:count]]
                             :filter      [:not-null $venue_category_name]}))))))

(deftest ^:parallel starts-with-filter-test
  (tqpt/test-timeseries-drivers
    (is (= {:columns ["venue_category_name"]
            :rows    [["Mediterannian"] ["Mexican"]]}
           (mt/rows+column-names
            (run-mbql-query checkins
                            {:breakout [$venue_category_name]
                             :filter   [:starts-with $venue_category_name "Me"]}))))

    (is (= {:columns ["venue_category_name"]
            :rows    []}
           (mt/rows+column-names
            (run-mbql-query checkins
                            {:breakout [$venue_category_name]
                             :filter   [:starts-with $venue_category_name "ME"]}))))

    (testing "case insensitive"
      (is (= {:columns ["venue_category_name"]
              :rows    [["Mediterannian"] ["Mexican"]]}
             (mt/rows+column-names
              (run-mbql-query checkins
                              {:breakout [$venue_category_name]
                               :filter   [:starts-with $venue_category_name "ME" {:case-sensitive false}]})))))))

(deftest ^:parallel ends-with-filter-test
  (tqpt/test-timeseries-drivers
    (is (= {:columns ["venue_category_name"]
            :rows    [["American"]
                      ["Artisan"]
                      ["Asian"]
                      ["Caribbean"]
                      ["German"]
                      ["Korean"]
                      ["Mediterannian"]
                      ["Mexican"]]}
           (mt/rows+column-names
            (run-mbql-query checkins
                            {:breakout [$venue_category_name]
                             :filter   [:ends-with $venue_category_name "an"]}))))

    (is (= {:columns ["venue_category_name"]
            :rows    []}
           (mt/rows+column-names
            (run-mbql-query checkins
                            {:breakout [$venue_category_name]
                             :filter   [:ends-with $venue_category_name "AN"]}))))

    (testing "case insensitive"
      (is (= {:columns ["venue_category_name"]
              :rows    [["American"]
                        ["Artisan"]
                        ["Asian"]
                        ["Caribbean"]
                        ["German"]
                        ["Korean"]
                        ["Mediterannian"]
                        ["Mexican"]]}
             (mt/rows+column-names
              (run-mbql-query checkins
                              {:breakout [$venue_category_name]
                               :filter   [:ends-with $venue_category_name "AN" {:case-sensitive false}]})))))))

(deftest ^:parallel contains-filter-test
  (tqpt/test-timeseries-drivers
    (is (= {:columns ["venue_category_name"]
            :rows    [["American"]
                      ["Bakery"]
                      ["Brewery"]
                      ["Burger"]
                      ["Diner"]
                      ["German"]
                      ["Mediterannian"]
                      ["Southern"]]}
           (mt/rows+column-names
            (run-mbql-query checkins
                            {:breakout [$venue_category_name]
                             :filter   [:contains $venue_category_name "er"]}))))

    (is (= {:columns ["venue_category_name"]
            :rows    []}
           (mt/rows+column-names
            (run-mbql-query checkins
                            {:breakout [$venue_category_name]
                             :filter   [:contains $venue_category_name "eR"]}))))

    (testing "case insensitive"
      (is (= {:columns ["venue_category_name"]
              :rows    [["American"]
                        ["Bakery"]
                        ["Brewery"]
                        ["Burger"]
                        ["Diner"]
                        ["German"]
                        ["Mediterannian"]
                        ["Southern"]]}
             (mt/rows+column-names
              (run-mbql-query checkins
                              {:breakout [$venue_category_name]
                               :filter   [:contains $venue_category_name "eR" {:case-sensitive false}]})))))))

(deftest ^:parallel order-by-aggregate-field-test
  (tqpt/test-timeseries-drivers
    (is (= {:columns ["user_name" "venue_category_name" "count"]
            :rows    [["Szymon Theutrich"    "Bar"      13]
                      ["Dwight Gresham"      "Mexican"  12]
                      ["Felipinho Asklepios" "Bar"      10]
                      ["Felipinho Asklepios" "Japanese" 10]
                      ["Kaneonuskatew Eiran" "Bar"      10]
                      ["Shad Ferdynand"      "Mexican"  10]
                      ["Spiros Teofil"       "American" 10]
                      ["Spiros Teofil"       "Bar"      10]
                      ["Dwight Gresham"      "Bar"       9]
                      ["Frans Hevel"         "Japanese"  9]]}
           (mt/rows+column-names
            (run-mbql-query checkins
                            {:aggregation [[:count]]
                             :breakout    [$user_name $venue_category_name]
                             :order-by    [[:desc [:aggregation 0]]]
                             :limit       10}))))))

(defn- iso8601 [s] (-> s u.date/parse u.date/format))

(deftest ^:parallel default-date-bucketing-test
  (tqpt/test-timeseries-drivers
    (testing "default date bucketing (day)"
      (is (= {:columns ["timestamp" "count"]
              :rows    [["2013-01-03T00:00:00Z" 1]
                        ["2013-01-10T00:00:00Z" 1]
                        ["2013-01-19T00:00:00Z" 1]
                        ["2013-01-22T00:00:00Z" 1]
                        ["2013-01-23T00:00:00Z" 1]]}
             (mt/formatted-rows+column-names
              [iso8601 int]
              (run-mbql-query
               checkins
               {:aggregation [[:count]]
                :breakout    [$timestamp]
                :limit       5})))))))

(deftest ^:parallel minute-date-bucketing-test
  (tqpt/test-timeseries-drivers
    (is (= {:columns ["timestamp" "count"]
            :rows    [["2013-01-03T00:00:00Z" 1]
                      ["2013-01-10T00:00:00Z" 1]
                      ["2013-01-19T00:00:00Z" 1]
                      ["2013-01-22T00:00:00Z" 1]
                      ["2013-01-23T00:00:00Z" 1]]}
           (mt/formatted-rows+column-names
            [iso8601 int]
            (run-mbql-query checkins
                            {:aggregation [[:count]]
                             :breakout    [[:field %timestamp {:temporal-unit :minute}]]
                             :limit       5}))))))

(defn- iso8601-date-part
  "Compiled queries are set to return date for non jdbc. For Druid that's not the case."
  [dt-str]
  (let [[d t] (str/split dt-str #"T")]
    (when (string? t)
      (is (= t "00:00:00Z")))
    d))

(deftest ^:parallel date-bucketing-test
  (tqpt/test-timeseries-drivers
   (doseq [[unit expected-rows format-fns]
           [[:minute-of-hour
             [[0 1000]]
             [int int]]

            [:hour
             [["2013-01-03T00:00:00Z" 1]
              ["2013-01-10T00:00:00Z" 1]
              ["2013-01-19T00:00:00Z" 1]
              ["2013-01-22T00:00:00Z" 1]
              ["2013-01-23T00:00:00Z" 1]]
             [iso8601 int]]

            [:hour-of-day
             [[0 1000]]
             [int int]]

            [:week
             [["2012-12-30" 1]
              ["2013-01-06" 1]
              ["2013-01-13" 1]
              ["2013-01-20" 4]
              ["2013-01-27" 1]]
             [iso8601-date-part int]]

            [:day
             [["2013-01-03T00:00:00Z" 1]
              ["2013-01-10T00:00:00Z" 1]
              ["2013-01-19T00:00:00Z" 1]
              ["2013-01-22T00:00:00Z" 1]
              ["2013-01-23T00:00:00Z" 1]]
             [iso8601 int]]

            [:day-of-week
             [[1 135]
              [2 143]
              [3 153]
              [4 136]
              [5 139]]
             [int int]]

            [:day-of-month
             [[1 36]
              [2 36]
              [3 42]
              [4 35]
              [5 43]]
             [int int]]

            [:day-of-year
             [[3 2]
              [4 6]
              [5 1]
              [6 1]
              [7 2]]
             [int int]]

            [:week-of-year
               [[1  8]
                [2  7]
                [3  8]
                [4  8]
                [5 14]]
               [int int]]

            [:month
             [["2013-01-01"  8]
              ["2013-02-01" 11]
              ["2013-03-01" 21]
              ["2013-04-01" 26]
              ["2013-05-01" 23]]
             [iso8601-date-part int]]

            [:month-of-year
             [[1  38]
              [2  70]
              [3  92]
              [4  89]
              [5 111]]
             [int int]]

            [:quarter
             [["2013-01-01" 40]
              ["2013-04-01" 75]
              ["2013-07-01" 55]
              ["2013-10-01" 65]
              ["2014-01-01" 107]]
             [iso8601-date-part int]]

            [:quarter-of-year
             [[1 200]
              [2 284]
              [3 278]
              [4 238]]
             [int int]]

            [:year
             [["2013-01-01" 235]
              ["2014-01-01" 498]
              ["2015-01-01" 267]]
             [iso8601-date-part int]]]
             ;; TODO: Find a way how to make those work with Druid JDBC.
             :when (not (and (= driver/*driver* :druid-jdbc)
                             (#{:week-of-year :day-of-week :week} unit)))]
     (testing unit
       (testing "topN query"
         (let [{:keys [columns rows]} (mt/formatted-rows+column-names
                                       format-fns
                                       (run-mbql-query checkins
                                                       {:aggregation [[:count]]
                                                        :breakout    [[:field %timestamp {:temporal-unit unit}]]
                                                        :limit       5}))]
           (is (= ["timestamp" "count"]
                  columns))
           (is (= expected-rows
                  rows))))
       ;; This test is similar to the above query but doesn't use a limit clause which causes the query to be a
       ;; grouped timeseries query rather than a topN query. The dates below are formatted incorrectly due to
       (testing "group timeseries query"
         (let [{:keys [columns rows]} (mt/formatted-rows+column-names
                                       format-fns
                                       (run-mbql-query checkins
                                                       {:aggregation [[:count]]
                                                        :breakout    [[:field %timestamp {:temporal-unit unit}]]}))]
           (is (= ["timestamp" "count"]
                  columns))
           (is (= expected-rows
                  (take 5 rows)))))))))

(deftest ^:parallel not-filter-test
  (tqpt/test-timeseries-drivers
    (testing "`not` filter -- Test that we can negate the various other filter clauses"
      (testing :=
        (is (= [999]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:= $id 1]]})))))

      (testing :!=
        (is (= [1]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:!= $id 1]]})))))
      (testing :<
        (is (= [961]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:< $id 40]]})))))

      (testing :>
        (is (= [40]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:> $id 40]]})))))

      (testing :<=
        (is (= [960]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:<= $id 40]]})))))

      (testing :>=
        (is (= [39]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:>= $id 40]]})))))

      (testing :is-null
        (is (= [1000]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:is-null $id]]})))))

      (testing :between
        (is (= [989]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:between $id 30 40]]})))))

      (testing :inside
        (is (= [377]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:inside $venue_latitude $venue_longitude 40 -120 30 -110]]})))))

      (testing :starts-with
        (is (= [795]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:starts-with $venue_name "T"]]})))))

      (testing :contains
        (is (= [971]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:contains $venue_name "BBQ"]]})))))

      (testing :ends-with
        (is (= [884]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:ends-with $venue_name "a"]]})))))

      (testing :and
        (is (= [975]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:and
                                                     [:> $id 32]
                                                     [:contains $venue_name "BBQ"]]]})))))

      (testing :or
        (is (= [28]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:or [:> $id 32]
                                                     [:contains $venue_name "BBQ"]]]})))))

      (testing "nested and/or"
        (is (= [969]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:or [:and
                                                          [:> $id 32]
                                                          [:< $id 35]]
                                                     [:contains $venue_name "BBQ"]]]})))))

      (testing "nested :not"
        (is (= [29]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:not [:not [:contains $venue_name "BBQ"]]]})))))

      (testing ":not nested inside and/or"
        (is (= [4]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:and
                                               [:not [:> $id 32]]
                                               [:contains $venue_name "BBQ"]]})))))

      (testing :time-interval
        (is (= [1000]
               (mt/first-row
                (run-mbql-query checkins
                                {:aggregation [[:count]]
                                 ;; test data is all in the past so nothing happened today <3
                                 :filter      [:not [:time-interval $timestamp :current :day]]}))))))))

(deftest ^:parallel min-test
  (tqpt/test-timeseries-drivers
    (testing "dimension columns"
      (is (=  [[1.0]]
             (mt/formatted-rows [double]
                                (run-mbql-query checkins
                                                {:aggregation [[:min $venue_price]]})))))

    (testing "metric columns"
      (is (= [[1.0]]
             (mt/formatted-rows [double]
                                (run-mbql-query checkins
                                                {:aggregation [[:min $count]]})))))

    (testing "with breakout"
      ;; some sort of weird quirk w/ druid where all columns in breakout get converted to strings
      (is (= [["1" 34.0071] ["2" 33.7701] ["3" 10.0646] ["4" 33.983]]
             ;; formatting to str because Druid JDBC does return int
             (mt/formatted-rows [str double]
                                (run-mbql-query checkins
                                                {:aggregation [[:min $venue_latitude]]
                                                 :breakout    [$venue_price]})))))))

(deftest ^:parallel max-test
  (tqpt/test-timeseries-drivers
    (testing "dimension columns"
      (is (= [[4.0]]
             (mt/formatted-rows [double]
                                (run-mbql-query checkins
                                                {:aggregation [[:max $venue_price]]})))))

    (testing "metric columns"
      (is (= [[1.0]]
             (mt/formatted-rows [double]
                                (run-mbql-query checkins
                                                {:aggregation [[:max $count]]})))))

    (testing "with breakout"
      (is (= [["1" 37.8078] ["2" 40.7794] ["3" 40.7262] ["4" 40.7677]]
             (mt/formatted-rows [str double]
                                (run-mbql-query checkins
                                                {:aggregation [[:max $venue_latitude]]
                                                 :breakout    [$venue_price]})))))))

(deftest ^:parallel multiple-aggregations-test
  (tqpt/test-timeseries-drivers
    (testing "Do we properly handle queries that have more than one of the same aggregation? (#4166)"
      (is (= [[35643 1992]]
             (mt/formatted-rows [int int]
                                (run-mbql-query checkins
                                                {:aggregation [[:sum $venue_latitude] [:sum $venue_price]]})))))))

(deftest ^:parallel sort-aggregations-in-timeseries-queries-test
  (tqpt/test-timeseries-drivers
    (testing "Make sure sorting by aggregations works correctly for Timeseries queries (#9185)"
      (is (= [["Steakhouse" 3.6]
              ["Chinese"    3.0]
              ["Wine Bar"   3.0]
              ["Japanese"   2.7]]
             (mt/formatted-rows [str 1.0]
                                (run-mbql-query checkins
                                                {:aggregation [[:avg $venue_price]]
                                                 :breakout    [[:field $venue_category_name nil]]
                                                 :order-by    [[:desc [:aggregation 0]]]
                                                 :limit       4})))))))
