(ns metabase.timeseries-query-processor-test
  "Query processor tests for DBs that are event-based, like Druid.
   There architecture is different enough that we can't test them along with our 'normal' DBs in `query-procesor-test`."
  (:require [expectations :refer :all]
            [metabase.query-processor.expand :as ql]
            [metabase.query-processor.interface :as qpi]
            [metabase.query-processor-test.util :refer :all]
            [metabase.test.data :as data]
            (metabase.test.data [dataset-definitions :as defs]
                                [datasets :as datasets]
                                [interface :as i])
            [metabase.util :as u]))

(def ^:private flattened-db-def
  "The normal test-data DB definition as a flattened, single-table DB definition.
  (this is a function rather than a straight delay because clojure complains when they delay gets embedding in expanded macros)"
  (delay (i/flatten-dbdef defs/test-data "checkins")))

;; force loading of the flattened db definitions for the DBs that need it
(defn- load-event-based-db-data!
  {:expectations-options :before-run}
  []
  (doseq [engine timeseries-engines]
    (datasets/with-engine-when-testing engine
      (data/do-with-temp-db @flattened-db-def (constantly nil)))))

(defn do-with-flattened-dbdef
  "Execute F with a flattened version of the test data DB as the current DB def."
  [f]
  (data/do-with-temp-db @flattened-db-def (u/drop-first-arg f)))

(defmacro with-flattened-dbdef
  "Execute BODY using the flattened test data DB definition."
  [& body]
  `(do-with-flattened-dbdef (fn [] ~@body)))

#_(defmacro ^:private expect-with-timeseries-dbs
  {:style/indent 0}
  [expected actual]
  `(datasets/expect-with-engines timeseries-engines
     (with-flattened-dbdef ~expected)
     (with-flattened-dbdef ~actual)))

;; NOCOMMIT
(defmacro ^:private expect-with-timeseries-dbs
  {:style/indent 0}
  [& _]
  nil)


;;; # Tests

;;; "bare rows" query, limit
(expect-with-timeseries-dbs
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
  (data (data/run-query checkins
          (ql/limit 2))))

;;; fields clause
(expect-with-timeseries-dbs
  {:columns ["venue_name" "venue_category_name" "timestamp"],
   :rows    [["Kinaree Thai Bistro"       "Thai" "2013-01-03T08:00:00.000Z"]
             ["Ruen Pair Thai Restaurant" "Thai" "2013-01-10T08:00:00.000Z"]]}
  (data (data/run-query checkins
          (ql/fields $venue_name $venue_category_name)
          (ql/limit 2))))

;;; count
(expect-with-timeseries-dbs
  [1000]
  (first-row (data/run-query checkins
               (ql/aggregation (ql/count)))))

;;; count(field)
(expect-with-timeseries-dbs
  [1000]
  (first-row (data/run-query checkins
               (ql/aggregation (ql/count $user_name)))))

;;; avg
(expect-with-timeseries-dbs
  {:columns ["avg"]
   :rows    [[1.992]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/avg $venue_price)))))

;;; sum
(expect-with-timeseries-dbs
  {:columns ["sum"]
   :rows    [[1992.0]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/sum $venue_price)))))

;;; avg
(expect-with-timeseries-dbs
  {:columns ["avg"]
   :rows    [[1.992]]}
  (->> (data/run-query checkins
         (ql/aggregation (ql/avg $venue_price)))
       (format-rows-by [(partial u/round-to-decimals 3)])
       data))

;;; distinct count
(expect-with-timeseries-dbs
  [[4]]
  (->> (data/run-query checkins
         (ql/aggregation (ql/distinct $venue_price)))
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
  (data (data/run-query checkins
          (ql/breakout $user_name))))

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
  (data (data/run-query checkins
          (ql/breakout $user_name $venue_category_name)
          (ql/limit 10))))

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
  (data (data/run-query checkins
          (ql/breakout $user_name)
          (ql/order-by (ql/desc $user_name))
          (ql/limit 10))))

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
  (data (data/run-query checkins
          (ql/breakout $user_name $venue_category_name)
          (ql/order-by (ql/asc $venue_category_name))
          (ql/limit 10))))

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
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout $user_name))))

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
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout $user_name $venue_category_name)
          (ql/limit 10))))

;;; filter >
(expect-with-timeseries-dbs
  [49]
  (first-row (data/run-query checkins
               (ql/aggregation (ql/count))
               (ql/filter (ql/> $venue_price 3)))))

;;; filter <
(expect-with-timeseries-dbs
  [836]
  (first-row (data/run-query checkins
               (ql/aggregation (ql/count))
               (ql/filter (ql/< $venue_price 3)))))

;;; filter >=
(expect-with-timeseries-dbs
  [164]
  (first-row (data/run-query checkins
               (ql/aggregation (ql/count))
               (ql/filter (ql/>= $venue_price 3)))))

;;; filter <=
(expect-with-timeseries-dbs
  [951]
  (first-row (data/run-query checkins
               (ql/aggregation (ql/count))
               (ql/filter (ql/<= $venue_price 3)))))

;;; filter =
(expect-with-timeseries-dbs
  {:columns ["user_name" "venue_name" "venue_category_name" "timestamp"]
   :rows    [["Plato Yeshua" "Fred 62"        "Diner"    "2013-03-12T07:00:00.000Z"]
             ["Plato Yeshua" "Dimples"        "Karaoke"  "2013-04-11T07:00:00.000Z"]
             ["Plato Yeshua" "Baby Blues BBQ" "BBQ"      "2013-06-03T07:00:00.000Z"]
             ["Plato Yeshua" "The Daily Pint" "Bar"      "2013-07-25T07:00:00.000Z"]
             ["Plato Yeshua" "Marlowe"        "American" "2013-09-10T07:00:00.000Z"]]}
  (data (data/run-query checkins
          (ql/fields $user_name $venue_name $venue_category_name)
          (ql/filter (ql/= $user_name "Plato Yeshua"))
          (ql/limit 5))))

;;; filter !=
(expect-with-timeseries-dbs
  [969]
  (first-row (data/run-query checkins
               (ql/aggregation (ql/count))
               (ql/filter (ql/!= $user_name "Plato Yeshua")))))

;;; filter AND
(expect-with-timeseries-dbs
  {:columns ["user_name" "venue_name" "timestamp"]
   :rows    [["Plato Yeshua" "The Daily Pint" "2013-07-25T07:00:00.000Z"]]}
  (data (data/run-query checkins
          (ql/fields $user_name $venue_name)
          (ql/filter (ql/and (ql/= $venue_category_name "Bar")
                             (ql/= $user_name "Plato Yeshua"))))))

;;; filter OR
(expect-with-timeseries-dbs
  [199]
  (first-row (data/run-query checkins
               (ql/aggregation (ql/count))
               (ql/filter (ql/or (ql/= $venue_category_name "Bar")
                                 (ql/= $venue_category_name "American"))))))

;;; filter BETWEEN (inclusive)
(expect-with-timeseries-dbs
  [951]
  (first-row (data/run-query checkins
               (ql/aggregation (ql/count))
               (ql/filter (ql/between $venue_price 1 3)))))

;;; filter INSIDE
(expect-with-timeseries-dbs
  {:columns ["venue_name"]
   :rows    [["Red Medicine"]]}
  (data (data/run-query checkins
          (ql/breakout $venue_name)
          (ql/filter (ql/inside $venue_latitude $venue_longitude 10.0649 -165.379 10.0641 -165.371)))))

;;; filter IS_NULL
(expect-with-timeseries-dbs
  [0]
  (first-row (data/run-query checkins
               (ql/aggregation (ql/count))
               (ql/filter (ql/is-null $venue_category_name)))))

;;; filter NOT_NULL
(expect-with-timeseries-dbs
  [1000]
  (first-row (data/run-query checkins
               (ql/aggregation (ql/count))
               (ql/filter (ql/not-null $venue_category_name)))))

;;; filter STARTS_WITH
(expect-with-timeseries-dbs
  {:columns ["venue_category_name"]
   :rows    [["Mediterannian"] ["Mexican"]]}
  (data (data/run-query checkins
          (ql/breakout $venue_category_name)
          (ql/filter (ql/starts-with $venue_category_name "Me")))))

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
  (data (data/run-query checkins
          (ql/breakout $venue_category_name)
          (ql/filter (ql/ends-with $venue_category_name "an")))))

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
  (data (data/run-query checkins
          (ql/breakout $venue_category_name)
          (ql/filter (ql/contains $venue_category_name "er")))))

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
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout $user_name $venue_category_name)
          (ql/order-by (ql/desc (ql/aggregate-field 0)))
          (ql/limit 10))))

;;; date bucketing - default (day)
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03+0000" 1]
             ["2013-01-10+0000" 1]
             ["2013-01-19+0000" 1]
             ["2013-01-22+0000" 1]
             ["2013-01-23+0000" 1]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout $timestamp)
          (ql/limit 5))))

;;; date bucketing - minute
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03T08:00:00+0000" 1]
             ["2013-01-10T08:00:00+0000" 1]
             ["2013-01-19T08:00:00+0000" 1]
             ["2013-01-22T08:00:00+0000" 1]
             ["2013-01-23T08:00:00+0000" 1]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :minute))
          (ql/limit 5))))

;;; date bucketing - minute-of-hour
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[0 1000]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :minute-of-hour))
          (ql/limit 5))))

;;; date bucketing - hour
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03T08:00:00+0000" 1]
             ["2013-01-10T08:00:00+0000" 1]
             ["2013-01-19T08:00:00+0000" 1]
             ["2013-01-22T08:00:00+0000" 1]
             ["2013-01-23T08:00:00+0000" 1]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :hour))
          (ql/limit 5))))

;;; date bucketing - hour-of-day
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[7 719]
             [8 281]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :hour-of-day))
          (ql/limit 5))))

;;; date bucketing - week
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2012-12-30" 1]
             ["2013-01-06" 1]
             ["2013-01-13" 1]
             ["2013-01-20" 4]
             ["2013-01-27" 1]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :week))
          (ql/limit 5))))

;;; date bucketing - day
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-03+0000" 1]
             ["2013-01-10+0000" 1]
             ["2013-01-19+0000" 1]
             ["2013-01-22+0000" 1]
             ["2013-01-23+0000" 1]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :day))
          (ql/limit 5))))

;;; date bucketing - day-of-week
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1 135]
             [2 143]
             [3 153]
             [4 136]
             [5 139]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :day-of-week))
          (ql/limit 5))))

;;; date bucketing - day-of-month
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1 36]
             [2 36]
             [3 42]
             [4 35]
             [5 43]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :day-of-month))
          (ql/limit 5))))

;;; date bucketing - day-of-year
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[3 2]
             [4 6]
             [5 1]
             [6 1]
             [7 2]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :day-of-year))
          (ql/limit 5))))

;;; date bucketing - week-of-year
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1 10]
             [2  7]
             [3  8]
             [4 10]
             [5  4]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :week-of-year))
          (ql/limit 5))))

;;; date bucketing - month
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-01"  8]
             ["2013-02-01" 11]
             ["2013-03-01" 21]
             ["2013-04-01" 26]
             ["2013-05-01" 23]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :month))
          (ql/limit 5))))

;;; date bucketing - month-of-year
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1  38]
             [2  70]
             [3  92]
             [4  89]
             [5 111]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :month-of-year))
          (ql/limit 5))))

;;; date bucketing - quarter
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [["2013-01-01" 40]
             ["2013-04-01" 75]
             ["2013-07-01" 55]
             ["2013-10-01" 65]
             ["2014-01-01" 107]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :quarter))
          (ql/limit 5))))

;;; date bucketing - quarter-of-year
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[1 200]
             [2 284]
             [3 278]
             [4 238]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :quarter-of-year))
          (ql/limit 5))))

;;; date bucketing - year
(expect-with-timeseries-dbs
  {:columns ["timestamp" "count"]
   :rows    [[2013 235]
             [2014 498]
             [2015 267]]}
  (data (data/run-query checkins
          (ql/aggregation (ql/count))
          (ql/breakout (ql/datetime-field $timestamp :year))
          (ql/limit 5))))



;;; `not` filter -- Test that we can negate the various other filter clauses

;;; =
(expect-with-timeseries-dbs [999] (first-row (data/run-query checkins
                                              (ql/aggregation (ql/count))
                                              (ql/filter (ql/not (ql/= $id 1))))))

;;; !=
(expect-with-timeseries-dbs [1] (first-row (data/run-query checkins
                                             (ql/aggregation (ql/count))
                                             (ql/filter (ql/not (ql/!= $id 1))))))
;;; <
(expect-with-timeseries-dbs [961] (first-row (data/run-query checkins
                                               (ql/aggregation (ql/count))
                                               (ql/filter (ql/not (ql/< $id 40))))))

;;; >
(expect-with-timeseries-dbs [40] (first-row (data/run-query checkins
                                              (ql/aggregation (ql/count))
                                              (ql/filter (ql/not (ql/> $id 40))))))

;;; <=
(expect-with-timeseries-dbs [960] (first-row (data/run-query checkins
                                               (ql/aggregation (ql/count))
                                               (ql/filter (ql/not (ql/<= $id 40))))))

;;; >=
(expect-with-timeseries-dbs [39] (first-row (data/run-query checkins
                                              (ql/aggregation (ql/count))
                                              (ql/filter (ql/not (ql/>= $id 40))))))

;;; is-null
(expect-with-timeseries-dbs [1000] (first-row (data/run-query checkins
                                                (ql/aggregation (ql/count))
                                                (ql/filter (ql/not (ql/is-null $id))))))

;;; between
(expect-with-timeseries-dbs [989] (first-row (data/run-query checkins
                                               (ql/aggregation (ql/count))
                                               (ql/filter (ql/not (ql/between $id 30 40))))))

;;; inside
(expect-with-timeseries-dbs [377] (first-row (data/run-query checkins
                                               (ql/aggregation (ql/count))
                                               (ql/filter (ql/not (ql/inside $venue_latitude $venue_longitude 40 -120 30 -110))))))

;;; starts-with
(expect-with-timeseries-dbs [795] (first-row (data/run-query checkins
                                               (ql/aggregation (ql/count))
                                               (ql/filter (ql/not (ql/starts-with $venue_name "T"))))))

;;; contains
(expect-with-timeseries-dbs [971] (first-row (data/run-query checkins
                                               (ql/aggregation (ql/count))
                                               (ql/filter (ql/not (ql/contains $venue_name "BBQ"))))))

;;; ends-with
(expect-with-timeseries-dbs [884] (first-row (data/run-query checkins
                                               (ql/aggregation (ql/count))
                                               (ql/filter (ql/not (ql/ends-with $venue_name "a"))))))

;;; and
(expect-with-timeseries-dbs [975] (first-row (data/run-query checkins
                                              (ql/aggregation (ql/count))
                                              (ql/filter (ql/not (ql/and (ql/> $id 32)
                                                                         (ql/contains $venue_name "BBQ")))))))
;;; or
(expect-with-timeseries-dbs [28] (first-row (data/run-query checkins
                                              (ql/aggregation (ql/count))
                                              (ql/filter (ql/not (ql/or (ql/> $id 32)
                                                                        (ql/contains $venue_name "BBQ")))))))

;;; nested and/or
(expect-with-timeseries-dbs [969] (first-row (data/run-query checkins
                                               (ql/aggregation (ql/count))
                                               (ql/filter (ql/not (ql/or (ql/and (ql/> $id 32)
                                                                                 (ql/< $id 35))
                                                                         (ql/contains $venue_name "BBQ")))))))

;;; nested not
(expect-with-timeseries-dbs [29] (first-row (data/run-query checkins
                                             (ql/aggregation (ql/count))
                                             (ql/filter (ql/not (ql/not (ql/contains $venue_name "BBQ")))))))

;;; not nested inside and/or
(expect-with-timeseries-dbs [4] (first-row (data/run-query checkins
                                             (ql/aggregation (ql/count))
                                             (ql/filter (ql/and (ql/not (ql/> $id 32))
                                                                (ql/contains $venue_name "BBQ"))))))

;;; time-interval
(expect-with-timeseries-dbs [1000] (first-row (data/run-query checkins
                                                (ql/aggregation (ql/count)) ; test data is all in the past so nothing happened today <3
                                                (ql/filter (ql/not (ql/time-interval $timestamp :current :day))))))



;;; MIN & MAX

;; tests for dimension columns
(expect-with-timeseries-dbs [4.0] (first-row (data/run-query checkins
                                               (ql/aggregation (ql/max $venue_price)))))

(expect-with-timeseries-dbs [1.0] (first-row (data/run-query checkins
                                               (ql/aggregation (ql/min $venue_price)))))

;; tests for metric columns
(expect-with-timeseries-dbs [1.0] (first-row (data/run-query checkins
                                               (ql/aggregation (ql/max $count)))))

(expect-with-timeseries-dbs [1.0] (first-row (data/run-query checkins
                                               (ql/aggregation (ql/min $count)))))

(expect-with-timeseries-dbs
  [["1" 34.0071] ["2" 33.7701] ["3" 10.0646] ["4" 33.983]] ; some sort of weird quirk w/ druid where all columns in breakout get converted to strings
  (rows (data/run-query checkins
          (ql/aggregation (ql/min $venue_latitude))
          (ql/breakout $venue_price))))

(expect-with-timeseries-dbs
  [["1" 37.8078] ["2" 40.7794] ["3" 40.7262] ["4" 40.7677]]
  (rows (data/run-query checkins
          (ql/aggregation (ql/max $venue_latitude))
          (ql/breakout $venue_price))))


;;; +----------------------------------------------------------------------------------------------------------------------+
;;; |                                                     EXPRESSIONS                                                      |
;;; +----------------------------------------------------------------------------------------------------------------------+

(defn- sort-by-id [results]
  (sort-by (comp #(Integer/parseInt %) first)
           results))

;; Do a basic query including an expression
(datasets/expect-with-engines (timeseries-engines-that-support :expressions)
  [["1" "The Misfit Restaurant + Bar" "2" 4.0 "2014-04-07T07:00:00.000Z"]
   ["2" "Bludso's BBQ"                "2" 4.0 "2014-09-18T07:00:00.000Z"]
   ["3" "Philippe the Original"       "1" 3.0 "2014-09-15T07:00:00.000Z"]
   ["4" "Wurstküche"                  "2" 4.0 "2014-03-11T07:00:00.000Z"]
   ["5" "Hotel Biron"                 "3" 5.0 "2013-05-05T07:00:00.000Z"]]
  (->> (rows (data/run-query checkins
               (ql/fields $id $venue_name $venue_price)
               (ql/expressions {:my-cool-new-field (ql/+ $venue_price 2)})))
       sort-by-id
       (take 5)))

;; Make sure FLOATING POINT division is done
(datasets/expect-with-engines (timeseries-engines-that-support :expressions)
  [["1" "The Misfit Restaurant + Bar" "2" 1.0 "2014-04-07T07:00:00.000Z"]
   ["2" "Bludso's BBQ"                "2" 1.0 "2014-09-18T07:00:00.000Z"]
   ["3" "Philippe the Original"       "1" 0.5 "2014-09-15T07:00:00.000Z"]] ; 1 / 2 should be 0.5, not 0
  (->> (rows (data/run-query checkins
               (ql/fields $id $venue_name $venue_price)
               (ql/expressions {:my-cool-new-field (ql// $venue_price 2)})))
       sort-by-id
       (take 3)))

;; Can we do NESTED EXPRESSIONS ?
(datasets/expect-with-engines (timeseries-engines-that-support :expressions)
   [[1 "Red Medicine"           4 10.0646 -165.374 3 3.0]
    [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 2.0]
    [3 "The Apple Pan"         11 34.0406 -118.428 2 2.0]]
   (->> (rows (data/run-query checkins
                (ql/expressions {:wow (ql/- (ql/* $venue_price 2) (ql/+ $venue_price 0))})))
        sort-by-id
        (take 3)))

;; Can we have MULTIPLE EXPRESSIONS?
(datasets/expect-with-engines (timeseries-engines-that-support :expressions)
  [["1" "The Misfit Restaurant + Bar" "2" 4.0 11.0 "2014-04-07T07:00:00.000Z"]
   ["2" "Bludso's BBQ"                "2" 4.0 12.0 "2014-09-18T07:00:00.000Z"]
   ["3" "Philippe the Original"       "1" 3.0 13.0 "2014-09-15T07:00:00.000Z"]]
  (->> (rows (data/run-query checkins
               (ql/fields $id $venue_name $venue_price)
               (ql/expressions {:my-cool-new-field-1 (ql/+ $venue_price 2)
                                :my-cool-new-field-2 (ql/+ $id 10)})))
       sort-by-id
       (take 3)))

;; Can we refer to expressions inside a FIELDS clause?
#_(datasets/expect-with-engines (timeseries-engines-that-support :expressions)
  [[4] [4] [5]]
  (rows (data/run-query checkins
          (ql/expressions {:x (ql/+ $venue_price $id)})
          (ql/fields (ql/expression :x))
          (ql/limit 3)
          (ql/order-by (ql/asc $id)))))

;; Can we refer to expressions inside an ORDER BY clause?
#_(datasets/expect-with-engines (timeseries-engines-that-support :expressions)
  [[100 "Mohawk Bend"         46 34.0777 -118.265 2 #_102.0 102.5]
   [99  "Golden Road Brewing" 10 34.1505 -118.274 2 101.0]
   [98  "Lucky Baldwin's Pub"  7 34.1454 -118.149 2 100.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (data/run-query checkins
            (ql/expressions {:x (ql/+ $venue_price $id)})
            (ql/limit 3)
            (ql/order-by (ql/desc (ql/expression :x)))))))

;; Can we AGGREGATE + BREAKOUT by an EXPRESSION?
#_(datasets/expect-with-engines (timeseries-engines-that-support :expressions)
  [[2 22] [4 59] [6 13] [8 6]]
  (format-rows-by [int int]
    (rows (data/run-query checkins
            (ql/expressions {:x (ql/* $venue_price 2.0)})
            (ql/aggregation (ql/count))
            (ql/breakout (ql/expression :x))))))
