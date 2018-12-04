(ns metabase.timeseries-query-processor-test
  "Query processor tests for DBs that are event-based, like Druid.
  There architecture is different enough that we can't test them along with our 'normal' DBs in `query-procesor-test`."
  (:require [metabase
             [query-processor-test :refer [first-row format-rows-by rows]]
             [util :as u]]
            [metabase.test.data :as data]
            [metabase.timeseries-query-processor-test.util :refer :all]))

(defn data [results]
  (when-let [data (or (:data results)
                      (println (u/pprint-to-str results)))] ; DEBUG
    (-> data
        (select-keys [:columns :rows])
        (update :rows vec))))

;;; # Tests

;;; "bare rows" query, limit
(expect-with-timeseries-dbs
  {:columns ["id"
             "count"
             "user_last_login"
             "user_name"
             "venue_category_name"
             "venue_latitude"
             "venue_longitude"
             "venue_name"
             "venue_price"
             "timestamp"]
   :rows [["931", 1, "2014-01-01T08:30:00.000Z", "Simcha Yan", "Thai", "34.094",  "-118.344", "Kinaree Thai Bistro",       "1", "2013-01-03T08:00:00.000Z"]
          ["285", 1, "2014-07-03T01:30:00.000Z", "Kfir Caj",   "Thai", "34.1021", "-118.306", "Ruen Pair Thai Restaurant", "2", "2013-01-10T08:00:00.000Z"]]}
  (data (data/run-mbql-query checkins
          {:limit 2})))

;;; "bare rows" query, limit, order-by timestamp desc
(expect-with-timeseries-dbs
  {:columns ["id"
             "count"
             "user_last_login"
             "user_name"
             "venue_category_name"
             "venue_latitude"
             "venue_longitude"
             "venue_name"
             "venue_price"
             "timestamp"]
   :rows    [["693", 1, "2014-07-03T19:30:00.000Z", "Frans Hevel", "Mexican", "34.0489", "-118.238", "Señor Fish",       "2", "2015-12-29T08:00:00.000Z"]
             ["570", 1, "2014-07-03T01:30:00.000Z", "Kfir Caj",    "Chinese", "37.7949", "-122.406", "Empress of China", "3", "2015-12-26T08:00:00.000Z"]]}
  (data (data/run-mbql-query checkins
          {:order-by [[:desc $timestamp]]
           :limit    2})))

;;; "bare rows" query, limit, order-by timestamp asc
(expect-with-timeseries-dbs
  {:columns ["id"
             "count"
             "user_last_login"
             "user_name"
             "venue_category_name"
             "venue_latitude"
             "venue_longitude"
             "venue_name"
             "venue_price"
             "timestamp"]
   :rows    [["931", 1, "2014-01-01T08:30:00.000Z", "Simcha Yan", "Thai", "34.094",  "-118.344", "Kinaree Thai Bistro",       "1", "2013-01-03T08:00:00.000Z"]
             ["285", 1, "2014-07-03T01:30:00.000Z", "Kfir Caj",   "Thai", "34.1021", "-118.306", "Ruen Pair Thai Restaurant", "2", "2013-01-10T08:00:00.000Z"]]}
  (data (data/run-mbql-query checkins
          {:order-by [[:asc $timestamp]]
           :limit    2})))



;;; fields clause
(expect-with-timeseries-dbs
  {:columns ["venue_name" "venue_category_name" "timestamp"],
   :rows    [["Kinaree Thai Bistro"       "Thai" "2013-01-03T08:00:00.000Z"]
             ["Ruen Pair Thai Restaurant" "Thai" "2013-01-10T08:00:00.000Z"]]}
  (data (data/run-mbql-query checkins
          {:fields [$venue_name $venue_category_name $timestamp]
           :limit  2})))

;;; fields clause, order by timestamp asc
(expect-with-timeseries-dbs
  {:columns ["venue_name" "venue_category_name" "timestamp"],
   :rows    [["Kinaree Thai Bistro"       "Thai" "2013-01-03T08:00:00.000Z"]
             ["Ruen Pair Thai Restaurant" "Thai" "2013-01-10T08:00:00.000Z"]]}
  (data (data/run-mbql-query checkins
          {:fields   [$venue_name $venue_category_name $timestamp]
           :order-by [[:asc $timestamp]]
           :limit    2})))

;;; fields clause, order by timestamp desc
(expect-with-timeseries-dbs
  {:columns ["venue_name" "venue_category_name" "timestamp"],
   :rows    [["Señor Fish"       "Mexican" "2015-12-29T08:00:00.000Z"]
             ["Empress of China" "Chinese" "2015-12-26T08:00:00.000Z"]]}
  (data (data/run-mbql-query checkins
          {:fields   [$venue_name $venue_category_name $timestamp]
           :order-by [[:desc $timestamp]]
           :limit    2})))



;;; count
(expect-with-timeseries-dbs
  [1000]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]})))

;;; count(field)
(expect-with-timeseries-dbs
  [1000]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count $user_name]]})))

;;; avg
(expect-with-timeseries-dbs
  {:columns ["avg"]
   :rows    [[1.992]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:avg $venue_price]]})))

;;; sum
(expect-with-timeseries-dbs
  {:columns ["sum"]
   :rows    [[1992.0]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:sum $venue_price]]})))

;;; avg
(expect-with-timeseries-dbs
  {:columns ["avg"]
   :rows    [[1.992]]}
  (->> (data/run-mbql-query checkins
         {:aggregation [[:avg $venue_price]]})
       (format-rows-by [(partial u/round-to-decimals 3)])
       data))

;;; distinct count
(expect-with-timeseries-dbs
  [[4]]
  (->> (data/run-mbql-query checkins
         {:aggregation [[:distinct $venue_price]]})
       rows (format-rows-by [int])))

;;; 1 breakout (distinct values)
(expect-with-timeseries-dbs
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
  (data (data/run-mbql-query checkins
          {:breakout [$user_name]})))

;;; 2 breakouts
(expect-with-timeseries-dbs
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
  (data (data/run-mbql-query checkins
          {:breakout [$user_name $venue_category_name]
           :limit    10})))

;;; 1 breakout w/ explicit order by
(expect-with-timeseries-dbs
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
  (data (data/run-mbql-query checkins
          {:breakout [$user_name]
           :order-by [[:desc $user_name]]
           :limit    10})))

;;; 2 breakouts w/ explicit order by
(expect-with-timeseries-dbs
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
  (data (data/run-mbql-query checkins
          {:breakout [$user_name $venue_category_name]
           :order-by [[:asc $venue_category_name]]
           :limit    10})))

;;; count w/ 1 breakout
(expect-with-timeseries-dbs
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
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [$user_name]})))

;;; count w/ 2 breakouts
(expect-with-timeseries-dbs
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
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [$user_name $venue_category_name]
           :limit       10})))

;;; filter >
(expect-with-timeseries-dbs
  [49]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:> $venue_price 3]})))

;;; filter <
(expect-with-timeseries-dbs
  [836]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:< $venue_price 3]})))

;;; filter >=
(expect-with-timeseries-dbs
  [164]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:>= $venue_price 3]})))

;;; filter <=
(expect-with-timeseries-dbs
  [951]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:<= $venue_price 3]})))

;;; filter =
(expect-with-timeseries-dbs
  {:columns ["user_name" "venue_name" "venue_category_name" "timestamp"]
   :rows    [["Plato Yeshua" "Fred 62"        "Diner"    "2013-03-12T07:00:00.000Z"]
             ["Plato Yeshua" "Dimples"        "Karaoke"  "2013-04-11T07:00:00.000Z"]
             ["Plato Yeshua" "Baby Blues BBQ" "BBQ"      "2013-06-03T07:00:00.000Z"]
             ["Plato Yeshua" "The Daily Pint" "Bar"      "2013-07-25T07:00:00.000Z"]
             ["Plato Yeshua" "Marlowe"        "American" "2013-09-10T07:00:00.000Z"]]}
  (data (data/run-mbql-query checkins
          {:fields [$user_name $venue_name $venue_category_name $timestamp]
           :filter [:= $user_name "Plato Yeshua"]
           :limit  5})))

;;; filter !=
(expect-with-timeseries-dbs
  [969]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:!= $user_name "Plato Yeshua"]})))

;;; filter AND
(expect-with-timeseries-dbs
  {:columns ["user_name" "venue_name" "timestamp"]
   :rows    [["Plato Yeshua" "The Daily Pint" "2013-07-25T07:00:00.000Z"]]}
  (data (data/run-mbql-query checkins
          {:fields [$user_name $venue_name $timestamp]
           :filter [:and
                    [:= $venue_category_name "Bar"]
                    [:= $user_name "Plato Yeshua"]]})))

;;; filter OR
(expect-with-timeseries-dbs
  [199]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:or
                     [:= $venue_category_name "Bar"]
                     [:= $venue_category_name "American"]]})))

;;; filter BETWEEN (inclusive)
(expect-with-timeseries-dbs
  [951]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:between $venue_price 1 3]})))

;;; filter INSIDE
(expect-with-timeseries-dbs
  {:columns ["venue_name"]
   :rows    [["Red Medicine"]]}
  (data (data/run-mbql-query checkins
          {:breakout [$venue_name]
           :filter   [:inside $venue_latitude $venue_longitude 10.0649 -165.379 10.0641 -165.371]})))

;;; filter IS_NULL
(expect-with-timeseries-dbs
  [0]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:is-null $venue_category_name]})))

;;; filter NOT_NULL
(expect-with-timeseries-dbs
  [1000]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not-null $venue_category_name]})))

;;; filter STARTS_WITH
(expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["Mediterannian"] ["Mexican"]]}
  (data (data/run-mbql-query checkins
          {:breakout [$venue_category_name]
           :filter   [:starts-with $venue_category_name "Me"]})))

(expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    []}
  (data (data/run-mbql-query checkins
          {:breakout [$venue_category_name]
           :filter   [:starts-with $venue_category_name "ME"]})))

(expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["Mediterannian"] ["Mexican"]]}
  (data (data/run-mbql-query checkins
          {:breakout [$venue_category_name]
           :filter   [:starts-with $venue_category_name "ME" {:case-sensitive false}]})))

;;; filter ENDS_WITH
(expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["American"]
             ["Artisan"]
             ["Asian"]
             ["Caribbean"]
             ["German"]
             ["Korean"]
             ["Mediterannian"]
             ["Mexican"]]}
  (data (data/run-mbql-query checkins
          {:breakout [$venue_category_name]
           :filter   [:ends-with $venue_category_name "an"]})))

(expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    []}
  (data (data/run-mbql-query checkins
          {:breakout [$venue_category_name]
           :filter   [:ends-with $venue_category_name "AN"]})))

(expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["American"]
             ["Artisan"]
             ["Asian"]
             ["Caribbean"]
             ["German"]
             ["Korean"]
             ["Mediterannian"]
             ["Mexican"]]}
  (data (data/run-mbql-query checkins
          {:breakout [$venue_category_name]
           :filter   [:ends-with $venue_category_name "AN" {:case-sensitive false}]})))

;;; filter CONTAINS
(expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["American"]
             ["Bakery"]
             ["Brewery"]
             ["Burger"]
             ["Diner"]
             ["German"]
             ["Mediterannian"]
             ["Southern"]]}
  (data (data/run-mbql-query checkins
          {:breakout [$venue_category_name]
           :filter   [:contains $venue_category_name "er"]})))

(expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    []}
  (data (data/run-mbql-query checkins
          {:breakout [$venue_category_name]
           :filter   [:contains $venue_category_name "eR"]})))

(expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["American"]
             ["Bakery"]
             ["Brewery"]
             ["Burger"]
             ["Diner"]
             ["German"]
             ["Mediterannian"]
             ["Southern"]]}
  (data (data/run-mbql-query checkins
          {:breakout [$venue_category_name]
           :filter   [:contains $venue_category_name "eR" {:case-sensitive false}]})))

;;; order by aggregate field (?)
(expect-with-timeseries-dbs
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
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [$user_name $venue_category_name]
           :order-by    [[:desc [:aggregation 0]]]
           :limit       10})))

;;; date bucketing - default (day)
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03+00:00" 1]
             ["2013-01-10+00:00" 1]
             ["2013-01-19+00:00" 1]
             ["2013-01-22+00:00" 1]
             ["2013-01-23+00:00" 1]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [$timestamp]
           :limit       5})))

;;; date bucketing - minute
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03T08:00:00+00:00" 1]
             ["2013-01-10T08:00:00+00:00" 1]
             ["2013-01-19T08:00:00+00:00" 1]
             ["2013-01-22T08:00:00+00:00" 1]
             ["2013-01-23T08:00:00+00:00" 1]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :minute]]
           :limit       5})))

;;; date bucketing - minute-of-hour
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[0 1000]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :minute-of-hour]]
           :limit       5})))

;;; date bucketing - hour
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03T08:00:00+00:00" 1]
             ["2013-01-10T08:00:00+00:00" 1]
             ["2013-01-19T08:00:00+00:00" 1]
             ["2013-01-22T08:00:00+00:00" 1]
             ["2013-01-23T08:00:00+00:00" 1]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :hour]]
           :limit       5})))

;;; date bucketing - hour-of-day
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[7 719]
             [8 281]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :hour-of-day]]
           :limit       5})))

;;; date bucketing - week
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2012-12-30" 1]
             ["2013-01-06" 1]
             ["2013-01-13" 1]
             ["2013-01-20" 4]
             ["2013-01-27" 1]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :week]]
           :limit       5})))

;;; date bucketing - day
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03+00:00" 1]
             ["2013-01-10+00:00" 1]
             ["2013-01-19+00:00" 1]
             ["2013-01-22+00:00" 1]
             ["2013-01-23+00:00" 1]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :day]]
           :limit       5})))

;;; date bucketing - day-of-week
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1 135]
             [2 143]
             [3 153]
             [4 136]
             [5 139]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :day-of-week]]
           :limit       5})))

;;; date bucketing - day-of-month
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1 36]
             [2 36]
             [3 42]
             [4 35]
             [5 43]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :day-of-month]]
           :limit       5})))

;;; date bucketing - day-of-year
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[3 2]
             [4 6]
             [5 1]
             [6 1]
             [7 2]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :day-of-year]]
           :limit       5})))

;;; date bucketing - week-of-year
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1 10]
             [2  7]
             [3  8]
             [4 10]
             [5  4]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :week-of-year]]
           :limit       5})))

;;; date bucketing - month
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-01"  8]
             ["2013-02-01" 11]
             ["2013-03-01" 21]
             ["2013-04-01" 26]
             ["2013-05-01" 23]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :month]]
           :limit       5})))

;; This test is similar to the above query but doesn't use a limit clause which causes the query to be a grouped
;; timeseries query rather than a topN query. The dates below are formatted incorrectly due to
;; https://github.com/metabase/metabase/issues/5969.
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-01" 8]
             ["2013-02-01" 11]
             ["2013-03-01" 21]
             ["2013-04-01" 26]
             ["2013-05-01" 23]]}
  (-> (data/run-mbql-query checkins
        {:aggregation [[:count]]
         :breakout    [[:datetime-field $timestamp :month]]})
      data
      (update :rows #(take 5 %))))

;;; date bucketing - month-of-year
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1  38]
             [2  70]
             [3  92]
             [4  89]
             [5 111]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :month-of-year]]
           :limit       5})))

;;; date bucketing - quarter
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-01" 40]
             ["2013-04-01" 75]
             ["2013-07-01" 55]
             ["2013-10-01" 65]
             ["2014-01-01" 107]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :quarter]]
           :limit       5})))

;;; date bucketing - quarter-of-year
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1 200]
             [2 284]
             [3 278]
             [4 238]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :quarter-of-year]]
           :limit       5})))

;;; date bucketing - year
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[2013 235]
             [2014 498]
             [2015 267]]}
  (data (data/run-mbql-query checkins
          {:aggregation [[:count]]
           :breakout    [[:datetime-field $timestamp :year]]
           :limit       5})))



;;; `not` filter -- Test that we can negate the various other filter clauses

;;; =
(expect-with-timeseries-dbs
  [999]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:= $id 1]]})))

;;; !=
(expect-with-timeseries-dbs
  [1]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:!= $id 1]]})))
;;; <
(expect-with-timeseries-dbs
  [961]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:< $id 40]]})))

;;; >
(expect-with-timeseries-dbs
  [40]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:> $id 40]]})))

;;; <=
(expect-with-timeseries-dbs
  [960]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:<= $id 40]]})))

;;; >=
(expect-with-timeseries-dbs
  [39]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:>= $id 40]]})))

;;; is-null
(expect-with-timeseries-dbs
  [1000]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:is-null $id]]})))

;;; between
(expect-with-timeseries-dbs
  [989]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:between $id 30 40]]})))

;;; inside
(expect-with-timeseries-dbs
  [377]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:inside $venue_latitude $venue_longitude 40 -120 30 -110]]})))

;;; starts-with
(expect-with-timeseries-dbs
  [795]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:starts-with $venue_name "T"]]})))

;;; contains
(expect-with-timeseries-dbs
  [971]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:contains $venue_name "BBQ"]]})))

;;; ends-with
(expect-with-timeseries-dbs
  [884]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:ends-with $venue_name "a"]]})))

;;; and
(expect-with-timeseries-dbs
  [975]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:and
                           [:> $id 32]
                           [:contains $venue_name "BBQ"]]]})))
;;; or
(expect-with-timeseries-dbs
  [28]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:or [:> $id 32]
                           [:contains $venue_name "BBQ"]]]})))

;;; nested and/or
(expect-with-timeseries-dbs
  [969]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:or [:and
                                [:> $id 32]
                                [:< $id 35]]
                           [:contains $venue_name "BBQ"]]]})))

;;; nested not
(expect-with-timeseries-dbs
  [29]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:not [:not [:contains $venue_name "BBQ"]]]})))

;;; not nested inside and/or
(expect-with-timeseries-dbs
  [4]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       :filter      [:and
                     [:not [:> $id 32]]
                     [:contains $venue_name "BBQ"]]})))

;;; time-interval
(expect-with-timeseries-dbs
  [1000]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:count]]
       ;; test data is all in the past so nothing happened today <3
       :filter      [:not [:time-interval $timestamp :current :day]]})))



;;; MIN & MAX

;; tests for dimension columns
(expect-with-timeseries-dbs
  [4.0]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:max $venue_price]]})))

(expect-with-timeseries-dbs
  [1.0]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:min $venue_price]]})))

;; tests for metric columns
(expect-with-timeseries-dbs
  [1.0]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:max $count]]})))

(expect-with-timeseries-dbs
  [1.0]
  (first-row
    (data/run-mbql-query checkins
      {:aggregation [[:min $count]]})))

(expect-with-timeseries-dbs
  ;; some sort of weird quirk w/ druid where all columns in breakout get converted to strings
  [["1" 34.0071] ["2" 33.7701] ["3" 10.0646] ["4" 33.983]]
  (rows (data/run-mbql-query checkins
          {:aggregation [[:min $venue_latitude]]
           :breakout    [$venue_price]})))

(expect-with-timeseries-dbs
  [["1" 37.8078] ["2" 40.7794] ["3" 40.7262] ["4" 40.7677]]
  (rows (data/run-mbql-query checkins
          {:aggregation [[:max $venue_latitude]]
           :breakout    [$venue_price]})))

;; Do we properly handle queries that have more than one of the same aggregation? (#4166)
(expect-with-timeseries-dbs
  [[35643 1992]]
  (format-rows-by [int int]
    (rows
      (data/run-mbql-query checkins
        {:aggregation [[:sum $venue_latitude] [:sum $venue_price]]}))))
