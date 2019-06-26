(ns metabase.query-processor.middleware.format-rows-test
  (:require [clj-time.coerce :as tc]
            [expectations :refer :all]
            [metabase
             [driver :as driver]
             [query-processor-test :as qp.test]]
            [metabase.query-processor.middleware.format-rows :as format-rows]
            [metabase.test
             [data :as data]
             [util :as tu]]))

(def ^:private dbs-exempt-from-format-rows-tests
  "DBs to skip the tests below for. TODO - why are so many databases not running these tests? Most of these should be
  able to pass with a few tweaks."
  #{:oracle :mongo :redshift :presto :sparksql :snowflake})

(qp.test/expect-with-non-timeseries-dbs-except dbs-exempt-from-format-rows-tests
  (if (= :sqlite driver/*driver*)
    [[1 "Plato Yeshua"        "2014-04-01 00:00:00" "08:30:00"]
     [2 "Felipinho Asklepios" "2014-12-05 00:00:00" "15:15:00"]
     [3 "Kaneonuskatew Eiran" "2014-11-06 00:00:00" "16:15:00"]
     [4 "Simcha Yan"          "2014-01-01 00:00:00" "08:30:00"]
     [5 "Quentin Sören"       "2014-10-03 00:00:00" "17:30:00"]]

    [[1 "Plato Yeshua"        "2014-04-01T00:00:00.000Z" "08:30:00.000Z"]
     [2 "Felipinho Asklepios" "2014-12-05T00:00:00.000Z" "15:15:00.000Z"]
     [3 "Kaneonuskatew Eiran" "2014-11-06T00:00:00.000Z" "16:15:00.000Z"]
     [4 "Simcha Yan"          "2014-01-01T00:00:00.000Z" "08:30:00.000Z"]
     [5 "Quentin Sören"       "2014-10-03T00:00:00.000Z" "17:30:00.000Z"]])
  (qp.test/rows
    (data/dataset test-data-with-time
      (data/run-mbql-query users
        {:order-by [[:asc $id]]
         :limit    5}))))

(qp.test/expect-with-non-timeseries-dbs-except dbs-exempt-from-format-rows-tests
  (cond
    (= :sqlite driver/*driver*)
    [[1 "Plato Yeshua"        "2014-04-01 00:00:00" "08:30:00"]
     [2 "Felipinho Asklepios" "2014-12-05 00:00:00" "15:15:00"]
     [3 "Kaneonuskatew Eiran" "2014-11-06 00:00:00" "16:15:00"]
     [4 "Simcha Yan"          "2014-01-01 00:00:00" "08:30:00"]
     [5 "Quentin Sören"       "2014-10-03 00:00:00" "17:30:00"]]

    (qp.test/supports-report-timezone? driver/*driver*)
    [[1 "Plato Yeshua"        "2014-04-01T00:00:00.000-07:00" "00:30:00.000-08:00"]
     [2 "Felipinho Asklepios" "2014-12-05T00:00:00.000-08:00" "07:15:00.000-08:00"]
     [3 "Kaneonuskatew Eiran" "2014-11-06T00:00:00.000-08:00" "08:15:00.000-08:00"]
     [4 "Simcha Yan"          "2014-01-01T00:00:00.000-08:00" "00:30:00.000-08:00"]
     [5 "Quentin Sören"       "2014-10-03T00:00:00.000-07:00" "09:30:00.000-08:00"]]

    :else
    [[1 "Plato Yeshua"        "2014-04-01T00:00:00.000Z" "08:30:00.000Z"]
     [2 "Felipinho Asklepios" "2014-12-05T00:00:00.000Z" "15:15:00.000Z"]
     [3 "Kaneonuskatew Eiran" "2014-11-06T00:00:00.000Z" "16:15:00.000Z"]
     [4 "Simcha Yan"          "2014-01-01T00:00:00.000Z" "08:30:00.000Z"]
     [5 "Quentin Sören"       "2014-10-03T00:00:00.000Z" "17:30:00.000Z"]])
  (data/dataset test-data-with-time
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (qp.test/rows
        (data/run-mbql-query users
          {:order-by [[:asc $id]]
           :limit    5})))))


(expect
  {:rows [["2011-04-18T10:12:47.232Z"]
          ["2011-04-18T00:00:00.000Z"]
          ["2011-04-18T10:12:47.232Z"]]}
  ((format-rows/format-rows
    (constantly
     {:rows
      [[(tc/to-sql-time 1303121567232)]
       [(tc/to-sql-date "2011-04-18")]  ; joda-time assumes this is UTC time when parsing it
       [(tc/to-date 1303121567232)]]}))
   {:settings {}}))

(expect
  {:rows [["2011-04-18T19:12:47.232+09:00"]
          ["2011-04-18T09:00:00.000+09:00"]
          ["2011-04-18T19:12:47.232+09:00"]]}
  ((format-rows/format-rows
    (constantly
     {:rows
      [[(tc/to-sql-time 1303121567232)]
       [(tc/to-sql-date "2011-04-18")]  ; joda-time assumes this is UTC time when parsing it
       [(tc/to-date 1303121567232)]]}))
   {:settings {:report-timezone "Asia/Tokyo"}}))
