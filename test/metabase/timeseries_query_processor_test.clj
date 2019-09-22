(ns metabase.timeseries-query-processor-test
  "Query processor tests for DBs that are event-based, like Druid.
  There architecture is different enough that we can't test them along with our 'normal' DBs in `query-procesor-test`."
  (:require [metabase.query-processor-test :as qp.test]
            [metabase.test.data :as data]
            [metabase.timeseries-query-processor-test.util :as tqp.test]))

;;; # Tests

;;; "bare rows" query, limit
(tqp.test/expect-with-timeseries-dbs
 {:columns ["id"
            "timestamp"
             "count"
             "user_last_login"
             "user_name"
             "venue_category_name"
             "venue_latitude"
             "venue_longitude"
             "venue_name"
             "venue_price"]
   :rows [["931", "2013-01-03T08:00:00.000Z", 1, "2014-01-01T08:30:00.000Z", "Simcha Yan", "Thai", "34.094",  "-118.344", "Kinaree Thai Bistro",       "1"]
          ["285", "2013-01-10T08:00:00.000Z", 1, "2014-07-03T01:30:00.000Z", "Kfir Caj",   "Thai", "34.1021", "-118.306", "Ruen Pair Thai Restaurant", "2"]]}
 (qp.test/rows+column-names
  (data/run-mbql-query checkins
    {:limit 2})))

;;; "bare rows" query, limit, order-by timestamp desc
(tqp.test/expect-with-timeseries-dbs
  {:columns ["id"
             "timestamp"
             "count"
             "user_last_login"
             "user_name"
             "venue_category_name"
             "venue_latitude"
             "venue_longitude"
             "venue_name"
             "venue_price"]
   :rows    [["693", "2015-12-29T08:00:00.000Z", 1, "2014-07-03T19:30:00.000Z", "Frans Hevel", "Mexican", "34.0489", "-118.238", "Señor Fish",       "2"]
             ["570", "2015-12-26T08:00:00.000Z", 1, "2014-07-03T01:30:00.000Z", "Kfir Caj",    "Chinese", "37.7949", "-122.406", "Empress of China", "3"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:order-by [[:desc $timestamp]]
      :limit    2})))

;;; "bare rows" query, limit, order-by timestamp asc
(tqp.test/expect-with-timeseries-dbs
  {:columns ["id"
             "timestamp"
             "count"
             "user_last_login"
             "user_name"
             "venue_category_name"
             "venue_latitude"
             "venue_longitude"
             "venue_name"
             "venue_price"]
   :rows    [["931", "2013-01-03T08:00:00.000Z", 1, "2014-01-01T08:30:00.000Z", "Simcha Yan", "Thai", "34.094",  "-118.344", "Kinaree Thai Bistro",       "1"]
             ["285", "2013-01-10T08:00:00.000Z", 1, "2014-07-03T01:30:00.000Z", "Kfir Caj",   "Thai", "34.1021", "-118.306", "Ruen Pair Thai Restaurant", "2"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:order-by [[:asc $timestamp]]
      :limit    2})))



;;; fields clause
(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_name" "venue_category_name" "timestamp"],
   :rows    [["Kinaree Thai Bistro"       "Thai" "2013-01-03T08:00:00.000Z"]
             ["Ruen Pair Thai Restaurant" "Thai" "2013-01-10T08:00:00.000Z"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:fields [$venue_name $venue_category_name $timestamp]
      :limit  2})))

;;; fields clause, order by timestamp asc
(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_name" "venue_category_name" "timestamp"],
   :rows    [["Kinaree Thai Bistro"       "Thai" "2013-01-03T08:00:00.000Z"]
             ["Ruen Pair Thai Restaurant" "Thai" "2013-01-10T08:00:00.000Z"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:fields   [$venue_name $venue_category_name $timestamp]
      :order-by [[:asc $timestamp]]
      :limit    2})))

;;; fields clause, order by timestamp desc
(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_name" "venue_category_name" "timestamp"],
   :rows    [["Señor Fish"       "Mexican" "2015-12-29T08:00:00.000Z"]
             ["Empress of China" "Chinese" "2015-12-26T08:00:00.000Z"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:fields   [$venue_name $venue_category_name $timestamp]
      :order-by [[:desc $timestamp]]
      :limit    2})))



;;; count
(tqp.test/expect-with-timeseries-dbs
  [1000]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]})))

;;; count(field)
(tqp.test/expect-with-timeseries-dbs
  [1000]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count $user_name]]})))

;;; avg
(tqp.test/expect-with-timeseries-dbs
  {:columns ["avg"]
   :rows    [[1.992]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:avg $venue_price]]})))

;;; sum
(tqp.test/expect-with-timeseries-dbs
  {:columns ["sum"]
   :rows    [[1992.0]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:sum $venue_price]]})))

;;; avg
(tqp.test/expect-with-timeseries-dbs
  {:columns ["avg"]
   :rows    [[1.992]]}
  (->> (data/run-mbql-query checkins
         {:aggregation [[:avg $venue_price]]})
       (qp.test/format-rows-by [3.0])
       qp.test/rows+column-names))

;;; distinct count
(tqp.test/expect-with-timeseries-dbs
  [[4]]
  (->> (data/run-mbql-query checkins
         {:aggregation [[:distinct $venue_price]]})
       qp.test/rows
       (qp.test/format-rows-by [int])))

;;; 1 breakout (distinct values)
(tqp.test/expect-with-timeseries-dbs
  {:columns ["user_name"]
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
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$user_name]})))

;;; 2 breakouts
(tqp.test/expect-with-timeseries-dbs
  {:columns ["user_name" "venue_category_name"]
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
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$user_name $venue_category_name]
      :limit    10})))

;;; 1 breakout w/ explicit order by
(tqp.test/expect-with-timeseries-dbs
  {:columns ["user_name"]
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
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$user_name]
      :order-by [[:desc $user_name]]
      :limit    10})))

;;; 2 breakouts w/ explicit order by
(tqp.test/expect-with-timeseries-dbs
  {:columns ["user_name" "venue_category_name"]
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
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$user_name $venue_category_name]
      :order-by [[:asc $venue_category_name]]
      :limit    10})))

;;; count w/ 1 breakout
(tqp.test/expect-with-timeseries-dbs
  {:columns ["user_name" "count"]
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
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [$user_name]})))

;;; count w/ 2 breakouts
(tqp.test/expect-with-timeseries-dbs
  {:columns ["user_name" "venue_category_name" "count"]
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
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [$user_name $venue_category_name]
      :limit       10})))

;;; filter >
(tqp.test/expect-with-timeseries-dbs
  [49]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:> $venue_price 3]})))

;;; filter <
(tqp.test/expect-with-timeseries-dbs
  [836]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:< $venue_price 3]})))

;;; filter >=
(tqp.test/expect-with-timeseries-dbs
  [164]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:>= $venue_price 3]})))

;;; filter <=
(tqp.test/expect-with-timeseries-dbs
  [951]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:<= $venue_price 3]})))

;;; filter =
(tqp.test/expect-with-timeseries-dbs
  {:columns ["user_name" "venue_name" "venue_category_name" "timestamp"]
   :rows    [["Plato Yeshua" "Fred 62"        "Diner"    "2013-03-12T07:00:00.000Z"]
             ["Plato Yeshua" "Dimples"        "Karaoke"  "2013-04-11T07:00:00.000Z"]
             ["Plato Yeshua" "Baby Blues BBQ" "BBQ"      "2013-06-03T07:00:00.000Z"]
             ["Plato Yeshua" "The Daily Pint" "Bar"      "2013-07-25T07:00:00.000Z"]
             ["Plato Yeshua" "Marlowe"        "American" "2013-09-10T07:00:00.000Z"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:fields [$user_name $venue_name $venue_category_name $timestamp]
      :filter [:= $user_name "Plato Yeshua"]
      :limit  5})))

;;; filter !=
(tqp.test/expect-with-timeseries-dbs
  [969]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:!= $user_name "Plato Yeshua"]})))

;;; filter AND
(tqp.test/expect-with-timeseries-dbs
  {:columns ["user_name" "venue_name" "timestamp"]
   :rows    [["Plato Yeshua" "The Daily Pint" "2013-07-25T07:00:00.000Z"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:fields [$user_name $venue_name $timestamp]
      :filter [:and
               [:= $venue_category_name "Bar"]
               [:= $user_name "Plato Yeshua"]]})))

;;; filter OR
(tqp.test/expect-with-timeseries-dbs
  [199]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:or
                     [:= $venue_category_name "Bar"]
                     [:= $venue_category_name "American"]]})))

;;; filter BETWEEN (inclusive)
(tqp.test/expect-with-timeseries-dbs
  [951]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:between $venue_price 1 3]})))

;;; filter INSIDE
(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_name"]
   :rows    [["Red Medicine"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$venue_name]
      :filter   [:inside $venue_latitude $venue_longitude 10.0649 -165.379 10.0641 -165.371]})))

;;; filter IS_NULL
(tqp.test/expect-with-timeseries-dbs
  [0]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:is-null $venue_category_name]})))

;;; filter NOT_NULL
(tqp.test/expect-with-timeseries-dbs
  [1000]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not-null $venue_category_name]})))

;;; filter STARTS_WITH
(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["Mediterannian"] ["Mexican"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$venue_category_name]
      :filter   [:starts-with $venue_category_name "Me"]})))

(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    []}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$venue_category_name]
      :filter   [:starts-with $venue_category_name "ME"]})))

(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["Mediterannian"] ["Mexican"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$venue_category_name]
      :filter   [:starts-with $venue_category_name "ME" {:case-sensitive false}]})))

;;; filter ENDS_WITH
(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["American"]
             ["Artisan"]
             ["Asian"]
             ["Caribbean"]
             ["German"]
             ["Korean"]
             ["Mediterannian"]
             ["Mexican"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$venue_category_name]
      :filter   [:ends-with $venue_category_name "an"]})))

(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    []}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$venue_category_name]
      :filter   [:ends-with $venue_category_name "AN"]})))

(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["American"]
             ["Artisan"]
             ["Asian"]
             ["Caribbean"]
             ["German"]
             ["Korean"]
             ["Mediterannian"]
             ["Mexican"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$venue_category_name]
      :filter   [:ends-with $venue_category_name "AN" {:case-sensitive false}]})))

;;; filter CONTAINS
(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["American"]
             ["Bakery"]
             ["Brewery"]
             ["Burger"]
             ["Diner"]
             ["German"]
             ["Mediterannian"]
             ["Southern"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$venue_category_name]
      :filter   [:contains $venue_category_name "er"]})))

(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    []}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$venue_category_name]
      :filter   [:contains $venue_category_name "eR"]})))

(tqp.test/expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["American"]
             ["Bakery"]
             ["Brewery"]
             ["Burger"]
             ["Diner"]
             ["German"]
             ["Mediterannian"]
             ["Southern"]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:breakout [$venue_category_name]
      :filter   [:contains $venue_category_name "eR" {:case-sensitive false}]})))

;;; order by aggregate field (?)
(tqp.test/expect-with-timeseries-dbs
  {:columns ["user_name" "venue_category_name" "count"]
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
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [$user_name $venue_category_name]
      :order-by    [[:desc [:aggregation 0]]]
      :limit       10})))

;;; date bucketing - default (day)
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03T00:00:00+00:00" 1]
             ["2013-01-10T00:00:00+00:00" 1]
             ["2013-01-19T00:00:00+00:00" 1]
             ["2013-01-22T00:00:00+00:00" 1]
             ["2013-01-23T00:00:00+00:00" 1]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [$timestamp]
      :limit       5})))

;;; date bucketing - minute
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03T08:00:00+00:00" 1]
             ["2013-01-10T08:00:00+00:00" 1]
             ["2013-01-19T08:00:00+00:00" 1]
             ["2013-01-22T08:00:00+00:00" 1]
             ["2013-01-23T08:00:00+00:00" 1]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :minute]]
      :limit       5})))

;;; date bucketing - minute-of-hour
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[0 1000]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :minute-of-hour]]
      :limit       5})))

;;; date bucketing - hour
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03T08:00:00+00:00" 1]
             ["2013-01-10T08:00:00+00:00" 1]
             ["2013-01-19T08:00:00+00:00" 1]
             ["2013-01-22T08:00:00+00:00" 1]
             ["2013-01-23T08:00:00+00:00" 1]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :hour]]
      :limit       5})))

;;; date bucketing - hour-of-day
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[7 719]
             [8 281]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :hour-of-day]]
      :limit       5})))

;;; date bucketing - week
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2012-12-30" 1]
             ["2013-01-06" 1]
             ["2013-01-13" 1]
             ["2013-01-20" 4]
             ["2013-01-27" 1]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :week]]
      :limit       5})))

;;; date bucketing - day
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03T00:00:00+00:00" 1]
             ["2013-01-10T00:00:00+00:00" 1]
             ["2013-01-19T00:00:00+00:00" 1]
             ["2013-01-22T00:00:00+00:00" 1]
             ["2013-01-23T00:00:00+00:00" 1]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :day]]
      :limit       5})))

;;; date bucketing - day-of-week
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1 135]
             [2 143]
             [3 153]
             [4 136]
             [5 139]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :day-of-week]]
      :limit       5})))

;;; date bucketing - day-of-month
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1 36]
             [2 36]
             [3 42]
             [4 35]
             [5 43]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :day-of-month]]
      :limit       5})))

;;; date bucketing - day-of-year
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[3 2]
             [4 6]
             [5 1]
             [6 1]
             [7 2]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :day-of-year]]
      :limit       5})))

;;; date bucketing - week-of-year
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1 10]
             [2  7]
             [3  8]
             [4 10]
             [5  4]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :week-of-year]]
      :limit       5})))

;;; date bucketing - month
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-01"  8]
             ["2013-02-01" 11]
             ["2013-03-01" 21]
             ["2013-04-01" 26]
             ["2013-05-01" 23]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :month]]
      :limit       5})))

;; This test is similar to the above query but doesn't use a limit clause which causes the query to be a grouped
;; timeseries query rather than a topN query. The dates below are formatted incorrectly due to
;; https://github.com/metabase/metabase/issues/5969.
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-01" 8]
             ["2013-02-01" 11]
             ["2013-03-01" 21]
             ["2013-04-01" 26]
             ["2013-05-01" 23]]}
  (-> (data/run-mbql-query checkins
        {:aggregation [[:count]]
         :breakout    [[:datetime-field $timestamp :month]]})
      qp.test/rows+column-names
      (update :rows #(take 5 %))))

;;; date bucketing - month-of-year
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1  38]
             [2  70]
             [3  92]
             [4  89]
             [5 111]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :month-of-year]]
      :limit       5})))

;;; date bucketing - quarter
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-01" 40]
             ["2013-04-01" 75]
             ["2013-07-01" 55]
             ["2013-10-01" 65]
             ["2014-01-01" 107]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :quarter]]
      :limit       5})))

;;; date bucketing - quarter-of-year
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1 200]
             [2 284]
             [3 278]
             [4 238]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :quarter-of-year]]
      :limit       5})))

;;; date bucketing - year
(tqp.test/expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-01" 235]
             ["2014-01-01" 498]
             ["2015-01-01" 267]]}
  (qp.test/rows+column-names
   (data/run-mbql-query checkins
     {:aggregation [[:count]]
      :breakout    [[:datetime-field $timestamp :year]]
      :limit       5})))



;;; `not` filter -- Test that we can negate the various other filter clauses

;;; =
(tqp.test/expect-with-timeseries-dbs
  [999]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:= $id 1]]})))

;;; !=
(tqp.test/expect-with-timeseries-dbs
  [1]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:!= $id 1]]})))
;;; <
(tqp.test/expect-with-timeseries-dbs
  [961]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:< $id 40]]})))

;;; >
(tqp.test/expect-with-timeseries-dbs
  [40]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:> $id 40]]})))

;;; <=
(tqp.test/expect-with-timeseries-dbs
  [960]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:<= $id 40]]})))

;;; >=
(tqp.test/expect-with-timeseries-dbs
  [39]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:>= $id 40]]})))

;;; is-null
(tqp.test/expect-with-timeseries-dbs
  [1000]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:is-null $id]]})))

;;; between
(tqp.test/expect-with-timeseries-dbs
  [989]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:between $id 30 40]]})))

;;; inside
(tqp.test/expect-with-timeseries-dbs
  [377]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:inside $venue_latitude $venue_longitude 40 -120 30 -110]]})))

;;; starts-with
(tqp.test/expect-with-timeseries-dbs
  [795]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:starts-with $venue_name "T"]]})))

;;; contains
(tqp.test/expect-with-timeseries-dbs
  [971]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:contains $venue_name "BBQ"]]})))

;;; ends-with
(tqp.test/expect-with-timeseries-dbs
  [884]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:ends-with $venue_name "a"]]})))

;;; and
(tqp.test/expect-with-timeseries-dbs
  [975]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:and
                           [:> $id 32]
                           [:contains $venue_name "BBQ"]]]})))
;;; or
(tqp.test/expect-with-timeseries-dbs
  [28]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:or [:> $id 32]
                           [:contains $venue_name "BBQ"]]]})))

;;; nested and/or
(tqp.test/expect-with-timeseries-dbs
  [969]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:or [:and
                                [:> $id 32]
                                [:< $id 35]]
                           [:contains $venue_name "BBQ"]]]})))

;;; nested not
(tqp.test/expect-with-timeseries-dbs
  [29]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:not [:contains $venue_name "BBQ"]]]})))

;;; not nested inside and/or
(tqp.test/expect-with-timeseries-dbs
  [4]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:and
                     [:not [:> $id 32]]
                     [:contains $venue_name "BBQ"]]})))

;;; time-interval
(tqp.test/expect-with-timeseries-dbs
  [1000]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       ;; test data is all in the past so nothing happened today <3
       :filter      [:not [:time-interval $timestamp :current :day]]})))



;;; MIN & MAX

;; tests for dimension columns
(tqp.test/expect-with-timeseries-dbs
  [4.0]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:max $venue_price]]})))

(tqp.test/expect-with-timeseries-dbs
  [1.0]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:min $venue_price]]})))

;; tests for metric columns
(tqp.test/expect-with-timeseries-dbs
  [1.0]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:max $count]]})))

(tqp.test/expect-with-timeseries-dbs
  [1.0]
  (qp.test/first-row
    (data/run-mbql-query checkins
      {:aggregation [[:min $count]]})))

(tqp.test/expect-with-timeseries-dbs
  ;; some sort of weird quirk w/ druid where all columns in breakout get converted to strings
  [["1" 34.0071] ["2" 33.7701] ["3" 10.0646] ["4" 33.983]]
  (qp.test/rows
    (data/run-mbql-query checkins
      {:aggregation [[:min $venue_latitude]]
       :breakout    [$venue_price]})))

(tqp.test/expect-with-timeseries-dbs
  [["1" 37.8078] ["2" 40.7794] ["3" 40.7262] ["4" 40.7677]]
  (qp.test/rows
    (data/run-mbql-query checkins
      {:aggregation [[:max $venue_latitude]]
       :breakout    [$venue_price]})))

;; Do we properly handle queries that have more than one of the same aggregation? (#4166)
(tqp.test/expect-with-timeseries-dbs
  [[35643 1992]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query checkins
        {:aggregation [[:sum $venue_latitude] [:sum $venue_price]]}))))

;; Make sure sorting by aggregations works correctly for Timeseries queries (#9185)
(tqp.test/expect-with-timeseries-dbs
  [["Steakhouse" 3.6]
   ["Chinese"    3.0]
   ["Wine Bar"   3.0]
   ["Japanese"   2.7]]
  (qp.test/format-rows-by [str 1.0]
    (qp.test/rows
      (data/run-mbql-query checkins
        {:aggregation  [[:avg $venue_price]]
         :breakout     [[:field-id $venue_category_name]]
         :order-by     [[:desc [:aggregation 0]]]
         :limit        4}))))
