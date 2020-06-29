(ns metabase.timeseries-query-processor-test
  "Query processor tests for DBs that are event-based, like Druid.
  There architecture is different enough that we can't test them along with our 'normal' DBs in `query-procesor-test`."
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor-test :as qp.test]
             [test :as mt]]
            [metabase.timeseries-query-processor-test.util :as tqp.test]))

(deftest limit-test
  (tqp.test/test-timeseries-drivers
    (is (= {:columns
            ["timestamp"
             "venue_name"
             "venue_longitude"
             "venue_latitude"
             "venue_price"
             "venue_category_name"
             "id"
             "count"
             "user_name"
             "user_last_login"]

            :rows
            [["2013-01-03T08:00:00Z" "Kinaree Thai Bistro"       "-118.344" "34.094"  "1" "Thai" "931" 1 "Simcha Yan" "2014-01-01T08:30:00.000Z"]
             ["2013-01-10T08:00:00Z" "Ruen Pair Thai Restaurant" "-118.306" "34.1021" "2" "Thai" "285" 1 "Kfir Caj"   "2014-07-03T01:30:00.000Z"]]}
           (mt/rows+column-names
             (mt/run-mbql-query checkins
               {:limit 2}))))))

(deftest fields-test
  (tqp.test/test-timeseries-drivers
    (is (= {:columns ["venue_name" "venue_category_name" "timestamp"],
            :rows    [["Kinaree Thai Bistro"        "Thai" "2013-01-03T08:00:00Z"]
                      ["Ruen Pair Thai Restaurant" "Thai"  "2013-01-10T08:00:00Z"]]}
           (mt/rows+column-names
             (mt/run-mbql-query checkins
               {:fields [$venue_name $venue_category_name $timestamp]
                :limit  2}))))))

;; TODO -- `:desc` tests are disabled for now, they don't seem to be working on Druid 0.11.0. Enable once we merge PR
;; to use Druid 0.17.0
(deftest order-by-timestamp-test
  (tqp.test/test-timeseries-drivers
    (testing "query w/o :fields"
      (doseq [[direction expected-rows]
              {#_:desc #_[["693" 1 "2015-12-29T08:00:00Z" "2014-07-03T19:30:00.000Z" "Frans Hevel" "Mexican" "34.0489" "-118.238" "Señor Fish"                "2"]
                          ["570" 1 "2015-12-26T08:00:00Z" "2014-07-03T01:30:00.000Z" "Kfir Caj"    "Chinese" "37.7949" "-122.406" "Empress of China"          "3"]]
               :asc  [["2013-01-03T08:00:00Z" "Kinaree Thai Bistro"       "-118.344" "34.094"  "1" "Thai" "931" 1 "Simcha Yan" "2014-01-01T08:30:00.000Z"]
                      ["2013-01-10T08:00:00Z" "Ruen Pair Thai Restaurant" "-118.306" "34.1021" "2" "Thai" "285" 1 "Kfir Caj"   "2014-07-03T01:30:00.000Z"]]}]
        (testing direction
          (is (= {:columns ["timestamp"
                            "venue_name"
                            "venue_longitude"
                            "venue_latitude"
                            "venue_price"
                            "venue_category_name"
                            "id"
                            "count"
                            "user_name"
                            "user_last_login"]
                  :rows    expected-rows}
                 (mt/rows+column-names
                   (mt/run-mbql-query checkins
                     {:order-by [[direction $timestamp]]
                      :limit    2})))))))

    (testing "for a query with :fields"
      (doseq [[direction expected-rows] {#_:desc #_[["Señor Fish" "Mexican"]
                                                    ["Empress of China" "Chinese"]]
                                         :asc  [["Kinaree Thai Bistro"       "Thai" "2013-01-03T08:00:00Z"]
                                                ["Ruen Pair Thai Restaurant" "Thai" "2013-01-10T08:00:00Z"]]}]
        (testing direction
          (is (= {:columns ["venue_name" "venue_category_name" "timestamp"],
                  :rows    expected-rows}
                 (mt/rows+column-names
                   (mt/run-mbql-query checkins
                     {:fields   [$venue_name $venue_category_name $timestamp]
                      :order-by [[direction $timestamp]]
                      :limit    2})))))))))

(deftest count-test
  (tqp.test/test-timeseries-drivers
    (is (= [1000]
           (mt/first-row
             (mt/run-mbql-query checkins
               {:aggregation [[:count]]}))))

    (testing "count of field"
      (is (= [1000]
             (mt/first-row
               (mt/run-mbql-query checkins
                 {:aggregation [[:count $user_name]]})))))))

(deftest avg-test
  (tqp.test/test-timeseries-drivers
    (is (= {:columns ["avg"]
            :rows    [[1.992]]}
           (mt/rows+column-names
             (mt/run-mbql-query checkins
               {:aggregation [[:avg $venue_price]]}))))))

(deftest sum-test
  (tqp.test/test-timeseries-drivers
    (= {:columns ["sum"]
        :rows    [[1992.0]]}
       (mt/rows+column-names
         (mt/run-mbql-query checkins
           {:aggregation [[:sum $venue_price]]})))))

(deftest avg-test
  (tqp.test/test-timeseries-drivers
    (is (= {:columns ["avg"]
            :rows    [[1.992]]}
           (->> (mt/run-mbql-query checkins
                  {:aggregation [[:avg $venue_price]]})
                (mt/format-rows-by [3.0])
                qp.test/rows+column-names)))))

(deftest distinct-count-test
  (tqp.test/test-timeseries-drivers
    (is (= [[4]]
           (->> (mt/run-mbql-query checkins
                  {:aggregation [[:distinct $venue_price]]})
                qp.test/rows
                (mt/format-rows-by [int]))))))

(deftest breakout-test
  (tqp.test/test-timeseries-drivers
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
               (mt/run-mbql-query checkins
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
               (mt/run-mbql-query checkins
                 {:breakout [$user_name $venue_category_name]
                  :limit    10})))))))

(deftest breakout-order-by-test
  (tqp.test/test-timeseries-drivers
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
               (mt/run-mbql-query checkins
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
               (mt/run-mbql-query checkins
                 {:breakout [$user_name $venue_category_name]
                  :order-by [[:asc $venue_category_name]]
                  :limit    10})))))))

(deftest count-with-breakout-test
  (tqp.test/test-timeseries-drivers
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
               (mt/run-mbql-query checkins
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
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :breakout    [$user_name $venue_category_name]
                  :limit       10})))))))

(deftest comparison-filter-test
  (tqp.test/test-timeseries-drivers
    (testing "filter >"
      (is (= [49]
             (mt/first-row
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:> $venue_price 3]})))))

    (testing "filter <"
      (is (= [836]
             (mt/first-row
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:< $venue_price 3]})))))

    (testing "filter >="
      (is (= [164]
             (mt/first-row
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:>= $venue_price 3]})))))

    (testing "filter <="
      (is (= [951]
             (mt/first-row
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:<= $venue_price 3]})))))))

(deftest equality-filter-test
  (tqp.test/test-timeseries-drivers
    (testing "filter ="
      (is (= {:columns ["user_name" "venue_name" "venue_category_name" "timestamp"]
              :rows    [["Plato Yeshua" "Fred 62"        "Diner"    "2013-03-12T07:00:00Z"]
                        ["Plato Yeshua" "Dimples"        "Karaoke"  "2013-04-11T07:00:00Z"]
                        ["Plato Yeshua" "Baby Blues BBQ" "BBQ"      "2013-06-03T07:00:00Z"]
                        ["Plato Yeshua" "The Daily Pint" "Bar"      "2013-07-25T07:00:00Z"]
                        ["Plato Yeshua" "Marlowe"        "American" "2013-09-10T07:00:00Z"]]}
             (mt/rows+column-names
               (mt/run-mbql-query checkins
                 {:fields [$user_name $venue_name $venue_category_name $timestamp]
                  :filter [:= $user_name "Plato Yeshua"]
                  :limit  5})))))

    (testing "filter !="
      (is (= [969]
             (mt/first-row
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:!= $user_name "Plato Yeshua"]})))))))

(deftest compound-filter-test
  (tqp.test/test-timeseries-drivers
    (testing "filter AND"
      (is (= {:columns ["user_name" "venue_name" "timestamp"]
              :rows    [["Plato Yeshua" "The Daily Pint" "2013-07-25T07:00:00Z"]]}
             (mt/rows+column-names
               (mt/run-mbql-query checkins
                 {:fields [$user_name $venue_name $timestamp]
                  :filter [:and
                           [:= $venue_category_name "Bar"]
                           [:= $user_name "Plato Yeshua"]]})))))

    (testing "filter OR"
      (is (= [199]
             (mt/first-row
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:or
                                [:= $venue_category_name "Bar"]
                                [:= $venue_category_name "American"]]})))))))

(deftest between-filter-test
  (tqp.test/test-timeseries-drivers
    (testing "filter BETWEEN (inclusive)"
      (is (= [951]
             (mt/first-row
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :filter      [:between $venue_price 1 3]})))))))

(deftest inside-filter-test
  (tqp.test/test-timeseries-drivers
    (is (= {:columns ["venue_name"]
            :rows    [["Red Medicine"]]}
           (mt/rows+column-names
             (mt/run-mbql-query checkins
               {:breakout [$venue_name]
                :filter   [:inside $venue_latitude $venue_longitude 10.0649 -165.379 10.0641 -165.371]}))))))

(deftest is-null-filter-test
  (tqp.test/test-timeseries-drivers
    (is (= [0]
           (mt/first-row
             (mt/run-mbql-query checkins
               {:aggregation [[:count]]
                :filter      [:is-null $venue_category_name]}))))))

(deftest not-null-filter-test
  (tqp.test/test-timeseries-drivers
    (is (= [1000]
           (mt/first-row
             (mt/run-mbql-query checkins
               {:aggregation [[:count]]
                :filter      [:not-null $venue_category_name]}))))))

(deftest starts-with-filter-test
  (tqp.test/test-timeseries-drivers
    (is (= {:columns ["venue_category_name"]
            :rows    [["Mediterannian"] ["Mexican"]]}
           (mt/rows+column-names
             (mt/run-mbql-query checkins
               {:breakout [$venue_category_name]
                :filter   [:starts-with $venue_category_name "Me"]}))))

    (is (= {:columns ["venue_category_name"]
            :rows    []}
           (mt/rows+column-names
             (mt/run-mbql-query checkins
               {:breakout [$venue_category_name]
                :filter   [:starts-with $venue_category_name "ME"]}))))

    (testing "case insensitive"
      (is (= {:columns ["venue_category_name"]
              :rows    [["Mediterannian"] ["Mexican"]]}
             (mt/rows+column-names
               (mt/run-mbql-query checkins
                 {:breakout [$venue_category_name]
                  :filter   [:starts-with $venue_category_name "ME" {:case-sensitive false}]})))))))

(deftest ends-with-filter-test
  (tqp.test/test-timeseries-drivers
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
             (mt/run-mbql-query checkins
               {:breakout [$venue_category_name]
                :filter   [:ends-with $venue_category_name "an"]}))))

    (is (= {:columns ["venue_category_name"]
            :rows    []}
           (mt/rows+column-names
             (mt/run-mbql-query checkins
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
               (mt/run-mbql-query checkins
                 {:breakout [$venue_category_name]
                  :filter   [:ends-with $venue_category_name "AN" {:case-sensitive false}]})))))))

(deftest contains-filter-test
  (tqp.test/test-timeseries-drivers
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
             (mt/run-mbql-query checkins
               {:breakout [$venue_category_name]
                :filter   [:contains $venue_category_name "er"]}))))

    (is (= {:columns ["venue_category_name"]
            :rows    []}
           (mt/rows+column-names
             (mt/run-mbql-query checkins
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
               (mt/run-mbql-query checkins
                 {:breakout [$venue_category_name]
                  :filter   [:contains $venue_category_name "eR" {:case-sensitive false}]})))))))

(deftest order-by-aggregate-field-test
  (tqp.test/test-timeseries-drivers
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
             (mt/run-mbql-query checkins
               {:aggregation [[:count]]
                :breakout    [$user_name $venue_category_name]
                :order-by    [[:desc [:aggregation 0]]]
                :limit       10}))))))

(deftest default-date-bucketing-test
  (tqp.test/test-timeseries-drivers
    (testing "default date bucketing (day)"
      (is (= {:columns ["timestamp" "count"]
              :rows    [["2013-01-03T00:00:00+00:00" 1]
                        ["2013-01-10T00:00:00+00:00" 1]
                        ["2013-01-19T00:00:00+00:00" 1]
                        ["2013-01-22T00:00:00+00:00" 1]
                        ["2013-01-23T00:00:00+00:00" 1]]}
             (mt/rows+column-names
               (mt/run-mbql-query checkins
                 {:aggregation [[:count]]
                  :breakout    [$timestamp]
                  :limit       5})))))))

(deftest minute-date-bucketing-test
  (tqp.test/test-timeseries-drivers
    (is (= {:columns ["timestamp" "count"]
            :rows    [["2013-01-03T08:00:00+00:00" 1]
                      ["2013-01-10T08:00:00+00:00" 1]
                      ["2013-01-19T08:00:00+00:00" 1]
                      ["2013-01-22T08:00:00+00:00" 1]
                      ["2013-01-23T08:00:00+00:00" 1]]}
           (mt/rows+column-names
             (mt/run-mbql-query checkins
               {:aggregation [[:count]]
                :breakout    [[:datetime-field $timestamp :minute]]
                :limit       5}))))))

(deftest date-bucketing-test
  (mt/test-drivers (tqp.test/timeseries-drivers)
    (tqp.test/with-flattened-dbdef
      (doseq [[unit expected-rows]
              {:minute-of-hour  [[0 1000]]
               :hour            [["2013-01-03T08:00:00+00:00" 1]
                                 ["2013-01-10T08:00:00+00:00" 1]
                                 ["2013-01-19T08:00:00+00:00" 1]
                                 ["2013-01-22T08:00:00+00:00" 1]
                                 ["2013-01-23T08:00:00+00:00" 1]]
               :hour-of-day     [[7 719]
                                 [8 281]]
               :week            [["2012-12-30" 1]
                                 ["2013-01-06" 1]
                                 ["2013-01-13" 1]
                                 ["2013-01-20" 4]
                                 ["2013-01-27" 1]]
               :day             [["2013-01-03T00:00:00+00:00" 1]
                                 ["2013-01-10T00:00:00+00:00" 1]
                                 ["2013-01-19T00:00:00+00:00" 1]
                                 ["2013-01-22T00:00:00+00:00" 1]
                                 ["2013-01-23T00:00:00+00:00" 1]]
               :day-of-week     [[1 135]
                                 [2 143]
                                 [3 153]
                                 [4 136]
                                 [5 139]]
               :day-of-month    [[1 36]
                                 [2 36]
                                 [3 42]
                                 [4 35]
                                 [5 43]]
               :day-of-year     [[3 2]
                                 [4 6]
                                 [5 1]
                                 [6 1]
                                 [7 2]]
               :week-of-year    [[1 10]
                                 [2  7]
                                 [3  8]
                                 [4 10]
                                 [5  4]]
               :month           [["2013-01-01"  8]
                                 ["2013-02-01" 11]
                                 ["2013-03-01" 21]
                                 ["2013-04-01" 26]
                                 ["2013-05-01" 23]]
               :month-of-year   [[1  38]
                                 [2  70]
                                 [3  92]
                                 [4  89]
                                 [5 111]]
               :quarter         [["2013-01-01" 40]
                                 ["2013-04-01" 75]
                                 ["2013-07-01" 55]
                                 ["2013-10-01" 65]
                                 ["2014-01-01" 107]]
               :quarter-of-year [[1 200]
                                 [2 284]
                                 [3 278]
                                 [4 238]]
               :year            [["2013-01-01" 235]
                                 ["2014-01-01" 498]
                                 ["2015-01-01" 267]]}]
        (testing unit
          (testing "topN query"
            (let [{:keys [columns rows]} (mt/rows+column-names
                                           (mt/run-mbql-query checkins
                                             {:aggregation [[:count]]
                                              :breakout    [[:datetime-field $timestamp unit]]
                                              :limit       5}))]
              (is (= ["timestamp" "count"]
                     columns))
              (is (= expected-rows
                     rows))))
          ;; This test is similar to the above query but doesn't use a limit clause which causes the query to be a
          ;; grouped timeseries query rather than a topN query. The dates below are formatted incorrectly due to
          (testing "group timeseries query"
            (let [{:keys [columns rows]} (mt/rows+column-names
                                           (mt/run-mbql-query checkins
                                             {:aggregation [[:count]]
                                              :breakout    [[:datetime-field $timestamp unit]]}))]
              (is (= ["timestamp" "count"]
                     columns))
              (is (= expected-rows
                     (take 5 rows))))))))))

(deftest not-filter-test
  (tqp.test/test-timeseries-drivers
    (testing "`not` filter -- Test that we can negate the various other filter clauses"
      (testing :=
        (is (= [999]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:= $id 1]]})))))

      (testing :!=
        (is (= [1]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:!= $id 1]]})))))
      (testing :<
        (is (= [961]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:< $id 40]]})))))

      (testing :>
        (is (= [40]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:> $id 40]]})))))

      (testing :<=
        (is (= [960]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:<= $id 40]]})))))

      (testing :>=
        (is (= [39]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:>= $id 40]]})))))

      (testing :is-null
        (is (= [1000]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:is-null $id]]})))))

      (testing :between
        (is (= [989]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:between $id 30 40]]})))))

      (testing :inside
        (is (= [377]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:inside $venue_latitude $venue_longitude 40 -120 30 -110]]})))))

      (testing :starts-with
        (is (= [795]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:starts-with $venue_name "T"]]})))))

      (testing :contains
        (is (= [971]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:contains $venue_name "BBQ"]]})))))

      (testing :ends-with
        (is (= [884]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:ends-with $venue_name "a"]]})))))

      (testing :and
        (is (= [975]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:and
                                        [:> $id 32]
                                        [:contains $venue_name "BBQ"]]]})))))

      (testing :or
        (is (= [28]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:or [:> $id 32]
                                        [:contains $venue_name "BBQ"]]]})))))

      (testing "nested and/or"
        (is (= [969]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:or [:and
                                             [:> $id 32]
                                             [:< $id 35]]
                                        [:contains $venue_name "BBQ"]]]})))))

      (testing "nested :not"
        (is (= [29]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:not [:not [:contains $venue_name "BBQ"]]]})))))

      (testing ":not nested inside and/or"
        (is (= [4]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    :filter      [:and
                                  [:not [:> $id 32]]
                                  [:contains $venue_name "BBQ"]]})))))

      (testing :time-interval
        (is (= [1000]
               (mt/first-row
                 (mt/run-mbql-query checkins
                   {:aggregation [[:count]]
                    ;; test data is all in the past so nothing happened today <3
                    :filter      [:not [:time-interval $timestamp :current :day]]}))))))))

(deftest min-test
  (tqp.test/test-timeseries-drivers
    (testing "dimension columns"
      (is (= [1.0]
             (mt/first-row
               (mt/run-mbql-query checkins
                 {:aggregation [[:min $venue_price]]})))))

    (testing "metric columns"
      (is (= [1.0]
             (mt/first-row
               (mt/run-mbql-query checkins
                 {:aggregation [[:min $count]]})))))

    (testing "with breakout"
      ;; some sort of weird quirk w/ druid where all columns in breakout get converted to strings
      (is (= [["1" 34.0071] ["2" 33.7701] ["3" 10.0646] ["4" 33.983]]
             (mt/rows
               (mt/run-mbql-query checkins
                 {:aggregation [[:min $venue_latitude]]
                  :breakout    [$venue_price]})))))))

(deftest max-test
  (tqp.test/test-timeseries-drivers
    (testing "dimension columns"
      (is (= [4.0]
             (mt/first-row
               (mt/run-mbql-query checkins
                 {:aggregation [[:max $venue_price]]})))))

    (testing "metric columns"
      (is (= [1.0]
             (mt/first-row
               (mt/run-mbql-query checkins
                 {:aggregation [[:max $count]]})))))

    (testing "with breakout"
      (is (= [["1" 37.8078] ["2" 40.7794] ["3" 40.7262] ["4" 40.7677]]
             (mt/rows
               (mt/run-mbql-query checkins
                 {:aggregation [[:max $venue_latitude]]
                  :breakout    [$venue_price]})))))))

(deftest multiple-aggregations-test
  (tqp.test/test-timeseries-drivers
    (testing "Do we properly handle queries that have more than one of the same aggregation? (#4166)"
      (is (= [[35643 1992]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query checkins
                 {:aggregation [[:sum $venue_latitude] [:sum $venue_price]]})))))))

(deftest sort-aggregations-in-timeseries-queries-test
  (tqp.test/test-timeseries-drivers
    (testing "Make sure sorting by aggregations works correctly for Timeseries queries (#9185)"
      (is (= [["Steakhouse" 3.6]
              ["Chinese"    3.0]
              ["Wine Bar"   3.0]
              ["Japanese"   2.7]]
             (mt/formatted-rows [str 1.0]
               (mt/run-mbql-query checkins
                 {:aggregation [[:avg $venue_price]]
                  :breakout    [[:field-id $venue_category_name]]
                  :order-by    [[:desc [:aggregation 0]]]
                  :limit       4})))))))
