(ns metabase.driver.event-query-processor-test
  "Query processor tests for DBs that are event-based, like Druid.
   There architecture is different enough that we can't test them along with our 'normal' DBs in `query-procesor-test`."
  (:require [expectations :refer :all]
            [metabase.driver.query-processor-test :refer [format-rows-by]]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.data :refer :all]
            [metabase.test.util.q :refer [Q]]
            [metabase.util :as u]))

(def ^:private ^:const event-based-dbs
  #{:druid})

(defmacro ^:private expect-with-event-based-dbs
  {:style/indent 0}
  [expected actual]
  `(datasets/expect-with-engines event-based-dbs
     ~expected
     ~actual))

(defn- data [results]
  (when-let [data (or (:data results)
                      (println (u/pprint-to-str results)))]
    (-> data
        (select-keys [:columns :rows])
        (update :rows vec))))

;;; # Tests

;;; "bare rows" query, limit
(expect-with-event-based-dbs
  {:columns ["id"
             "timestamp"
             "count"
             "user_last_login"
             "user_name"
             "user_password"
             "venue_category_name"
             "venue_latitude"
             "venue_longitude"
             "venue_name"
             "venue_price"]
   :rows [["931", "2013-01-03T08:00:00.000Z", 1, "2014-01-01T08:30:00.000Z", "Simcha Yan", "a61f97c6-4484-4a63-b37e-b5e58bfa2ecb", "Thai", "34.094",  "-118.344", "Kinaree Thai Bistro",       "1"]
          ["285", "2013-01-10T08:00:00.000Z", 1, "2014-07-03T01:30:00.000Z", "Kfir Caj",   "dfe21df3-f364-479d-a5e7-04bc5d85ad2b", "Thai", "34.1021", "-118.306", "Ruen Pair Thai Restaurant", "2"]]}
  (Q aggregate rows of checkins
     limit 2, return :data))

;;; fields clause
(expect-with-event-based-dbs
  {:columns ["venue_name" "venue_category_name" "timestamp"],
   :rows    [["Kinaree Thai Bistro"       "Thai" "2013-01-03T08:00:00.000Z"]
             ["Ruen Pair Thai Restaurant" "Thai" "2013-01-10T08:00:00.000Z"]]}
  (Q aggregate rows of checkins
     fields venue_name venue_category_name
     limit 2, return data))

;;; count
(expect-with-event-based-dbs
  [1000]
 (Q aggregate count of checkins
    return first-row))

;;; count(field)
(expect-with-event-based-dbs
  [1000]
  (Q aggregate count user_name of checkins
     return first-row first))

;;; avg
(expect-with-event-based-dbs
  {:columns ["avg"]
   :rows    [[1.992]]}
  (Q aggregate avg venue_price of checkins
     return data))

;;; sum
(expect-with-event-based-dbs
  {:columns ["sum"]
   :rows    [[1992.0]]}
  (Q aggregate sum venue_price of checkins
     return data))

;;; avg
(datasets/expect-with-engine :druid
  "venue_price is a dimension, not a metric. You can only sum or averge metrics."
  (Q aggregate avg venue_price of checkins))

;;; distinct count
(expect-with-event-based-dbs
  [[4]]
  (Q aggregate distinct venue_price of checkins
     return rows (format-rows-by [int])))

;;; 1 breakout (distinct values)
(expect-with-event-based-dbs
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
  (Q aggregate rows of checkins
     breakout user_name, return data))

;;; 2 breakouts
(expect-with-event-based-dbs
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
  (Q aggregate rows of checkins
     breakout user_name venue_category_name
     limit 10, return data))

;;; 1 breakout w/ explicit order by
(expect-with-event-based-dbs
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
  (Q aggregate rows of checkins
     breakout user_name
     order user_name-
     limit 10, return data))

;;; 2 breakouts w/ explicit order by
(expect-with-event-based-dbs
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
  (Q aggregate rows of checkins
     breakout user_name venue_category_name
     order venue_category_name+
     limit 10, return data))

;;; count w/ 1 breakout
(expect-with-event-based-dbs
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
 (Q aggregate count of checkins
    breakout user_name
    return data))

;;; count w/ 2 breakouts
(expect-with-event-based-dbs
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
  (Q aggregate count of checkins
     breakout user_name venue_category_name
     limit 10, return data))

;;; filter >
(expect-with-event-based-dbs
  [49]
  (Q aggregate count of checkins
     filter > venue_price 3
     return first-row))

;;; filter <
(expect-with-event-based-dbs
  [836]
  (Q aggregate count of checkins
     filter < venue_price 3
     return first-row))

;;; filter >=
(expect-with-event-based-dbs
  [164]
  (Q aggregate count of checkins
     filter >= venue_price 3
     return first-row))

;;; filter <=
(expect-with-event-based-dbs
  [951]
  (Q aggregate count of checkins
     filter <= venue_price 3
     return first-row))

;;; filter =
(expect-with-event-based-dbs
  {:columns ["user_name" "venue_name" "venue_category_name" "timestamp"]
   :rows    [["Plato Yeshua" "Fred 62"        "Diner"    "2013-03-12T07:00:00.000Z"]
             ["Plato Yeshua" "Dimples"        "Karaoke"  "2013-04-11T07:00:00.000Z"]
             ["Plato Yeshua" "Baby Blues BBQ" "BBQ"      "2013-06-03T07:00:00.000Z"]
             ["Plato Yeshua" "The Daily Pint" "Bar"      "2013-07-25T07:00:00.000Z"]
             ["Plato Yeshua" "Marlowe"        "American" "2013-09-10T07:00:00.000Z"]]}
  (Q fields user_name venue_name venue_category_name, of checkins
     filter = user_name "Plato Yeshua"
     limit 5, return data))

;;; filter !=
(expect-with-event-based-dbs
  [969]
  (Q aggregate count of checkins
     filter != user_name "Plato Yeshua"
     return first-row))

;;; filter AND
(expect-with-event-based-dbs
  {:columns ["user_name" "venue_name" "timestamp"]
   :rows    [["Plato Yeshua" "The Daily Pint" "2013-07-25T07:00:00.000Z"]]}
  (Q return data, fields user_name venue_name of checkins
     filter and = venue_category_name "Bar"
                = user_name "Plato Yeshua"))

;;; filter OR
(expect-with-event-based-dbs
  [199]
  (Q aggregate count of checkins, return first-row
     filter or = venue_category_name "Bar"
               = venue_category_name "American"))

;;; filter BETWEEN (inclusive)
(expect-with-event-based-dbs
  [951]
  (Q aggregate count of checkins
     filter between venue_price 1 3
     return first-row))

;;; filter INSIDE
(expect-with-event-based-dbs
  {:columns ["venue_name"]
   :rows    [["Red Medicine"]]}
  (Q breakout venue_name of checkins, return data
     filter inside {:lat {:field venue_latitude,  :min 10.0641,  :max 10.0649}
                    :lon {:field venue_longitude, :min -165.379, :max -165.371}}))

;;; filter IS_NULL
(expect-with-event-based-dbs
  [0]
  (Q aggregate count of checkins, return first-row
     filter is-null venue_category_name))

;;; filter NOT_NULL
(expect-with-event-based-dbs
  [1000]
  (Q aggregate count of checkins, return first-row
     filter not-null venue_category_name))

;;; filter STARTS_WITH
(expect-with-event-based-dbs
  {:columns ["venue_category_name"]
   :rows    [["Mediterannian"] ["Mexican"]]}
  (Q breakout venue_category_name of checkins
     filter starts-with venue_category_name "Me"
     return data))

;;; filter ENDS_WITH
(expect-with-event-based-dbs
  {:columns ["venue_category_name"]
   :rows    [["American"]
             ["Artisan"]
             ["Asian"]
             ["Caribbean"]
             ["German"]
             ["Korean"]
             ["Mediterannian"]
             ["Mexican"]]}
  (Q breakout venue_category_name of checkins
     filter ends-with venue_category_name "an"
     return data))

;;; filter CONTAINS
(expect-with-event-based-dbs
  {:columns ["venue_category_name"]
   :rows    [["American"]
             ["Bakery"]
             ["Brewery"]
             ["Burger"]
             ["Diner"]
             ["German"]
             ["Mediterannian"]
             ["Southern"]]}
  (Q breakout venue_category_name of checkins
     filter contains venue_category_name "er"
     return data))

;;; order by aggregate field (?)
(expect-with-event-based-dbs
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
  (Q aggregate count of checkins
     breakout user_name venue_category_name
     order ag.0-
     limit 10, return data))

;;; date bucketing - default (day)
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03-0800" 1]
             ["2013-01-10-0800" 1]
             ["2013-01-19-0800" 1]
             ["2013-01-22-0800" 1]
             ["2013-01-23-0800" 1]]}
  (Q aggregate count of checkins
     breakout timestamp
     return data, limit 5))

;;; date bucketing - minute
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03T00:00:00-0800" 1] ["2013-01-10T00:00:00-0800" 1] ["2013-01-19T00:00:00-0800" 1] ["2013-01-22T00:00:00-0800" 1] ["2013-01-23T00:00:00-0800" 1]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "minute"] return data, limit 5))

;;; date bucketing - minute-of-hour
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["00" 1000]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "minute-of-hour"] return data, limit 5))

;;; date bucketing - hour
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03T00:00:00-0800" 1]
             ["2013-01-10T00:00:00-0800" 1]
             ["2013-01-19T00:00:00-0800" 1]
             ["2013-01-22T00:00:00-0800" 1]
             ["2013-01-23T00:00:00-0800" 1]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "hour"]
     return data, limit 5))

;;; date bucketing - hour-of-day
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["00" 1000]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "hour-of-day"]
     return data))

;;; date bucketing - week
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2012-12-30" 1]
             ["2013-01-06" 1]
             ["2013-01-13" 1]
             ["2013-01-20" 4]
             ["2013-01-27" 1]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "week"]
     return data, limit 5))

;;; date bucketing - day
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03-0800" 1]
             ["2013-01-10-0800" 1]
             ["2013-01-19-0800" 1]
             ["2013-01-22-0800" 1]
             ["2013-01-23-0800" 1]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "day"]
     return data, limit 5))

;;; date bucketing - day-of-week
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["1" 135]
             ["2" 143]
             ["3" 153]
             ["4" 136]
             ["5" 139]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "day-of-week"]
     return data, limit 5))

;;; date bucketing - day-of-month
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["01" 36]
             ["02" 36]
             ["03" 42]
             ["04" 35]
             ["05" 43]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "day-of-month"]
     return data, limit 5))

;;; date bucketing - day-of-year
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["003" 2]
             ["004" 6]
             ["005" 1]
             ["006" 1]
             ["007" 2]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "day-of-year"]
     return data, limit 5))

;;; date bucketing - week-of-year
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["01" 10]
             ["02"  7]
             ["03"  8]
             ["04" 10]
             ["05"  4]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "week-of-year"]
     return data, limit 5))

;;; date bucketing - month
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-01"  8]
             ["2013-02-01" 11]
             ["2013-03-01" 21]
             ["2013-04-01" 26]
             ["2013-05-01" 23]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "month"]
     return data, limit 5))

;;; date bucketing - month-of-year
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["01" 38]
             ["02" 70]
             ["03" 92]
             ["04" 89]
             ["05" 111]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "month-of-year"]
     return data, limit 5))

;;; date bucketing - quarter
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-01" 40]
             ["2013-04-01" 75]
             ["2013-07-01" 55]
             ["2013-10-01" 65]
             ["2014-01-01" 107]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "quarter"]
     return data, limit 5))

;;; date bucketing - quarter-of-year
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["1" 200]
             ["2" 284]
             ["3" 278]
             ["4" 238]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "quarter-of-year"]
     return data))

;;; date bucketing - year
(expect-with-event-based-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013" 235]
             ["2014" 498]
             ["2015" 267]]}
  (Q aggregate count of checkins, breakout ["datetime_field" (id :checkins :timestamp) "as" "year"]
     return data))
