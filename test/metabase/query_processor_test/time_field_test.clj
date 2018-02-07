(ns metabase.query-processor-test.time-field-test
  (:require [metabase.query-processor-test :as qpt]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :refer [*engine*]]]))

(defmacro ^:private time-query [& filter-clauses]
  `(qpt/rows
     (data/with-db (data/get-or-create-database! defs/test-data-with-time)
       (data/run-query users
         (ql/fields ~'$id ~'$name ~'$last_login_time)
         (ql/order-by (ql/asc ~'$id))
         ~@filter-clauses))))

;; Basic between query on a time field
(qpt/expect-with-non-timeseries-dbs-except #{:oracle :mongo :redshift}
  (if (= :sqlite *engine*)
    [[1 "Plato Yeshua" "08:30:00"]
     [4 "Simcha Yan"   "08:30:00"]]

    [[1 "Plato Yeshua" "08:30:00.000Z"]
     [4 "Simcha Yan"   "08:30:00.000Z"]])
  (time-query (ql/filter (ql/between $last_login_time
                                     "08:00:00"
                                     "09:00:00"))))

;; Basic between query on a time field with milliseconds
(qpt/expect-with-non-timeseries-dbs-except #{:oracle :mongo :redshift}
  (if (= :sqlite *engine*)
    [[1 "Plato Yeshua" "08:30:00"]
     [4 "Simcha Yan"   "08:30:00"]]

    [[1 "Plato Yeshua" "08:30:00.000Z"]
     [4 "Simcha Yan"   "08:30:00.000Z"]])
  (time-query (ql/filter (ql/between $last_login_time
                                     "08:00:00.000"
                                     "09:00:00.000"))))

;; Basic > query with a time field
(qpt/expect-with-non-timeseries-dbs-except #{:oracle :mongo :redshift}
  (if (= :sqlite *engine*)
    [[3 "Kaneonuskatew Eiran" "16:15:00"]
     [5 "Quentin Sören" "17:30:00"]
     [10 "Frans Hevel" "19:30:00"]]

    [[3 "Kaneonuskatew Eiran" "16:15:00.000Z"]
     [5 "Quentin Sören" "17:30:00.000Z"]
     [10 "Frans Hevel" "19:30:00.000Z"]])
  (time-query (ql/filter (ql/> $last_login_time "16:00:00.000Z"))))

;; Basic query with an = filter on a time field
(qpt/expect-with-non-timeseries-dbs-except #{:oracle :mongo :redshift}
  (if (= :sqlite *engine*)
    [[3 "Kaneonuskatew Eiran" "16:15:00"]]

    [[3 "Kaneonuskatew Eiran" "16:15:00.000Z"]])
  (time-query (ql/filter (ql/= $last_login_time "16:15:00.000Z"))))

;; Query with a time filter and a report timezone
(qpt/expect-with-non-timeseries-dbs-except #{:oracle :mongo :redshift}
  (cond
    (= :sqlite *engine*)
    [[1 "Plato Yeshua" "08:30:00"]
     [4 "Simcha Yan" "08:30:00"]]

    ;; This is the correct "answer" to this query, though it doesn't
    ;; pass through JDBC. The 08:00 is adjusted to UTC (16:00), which
    ;; should yield the third item
    (= :presto *engine*)
    [[3 "Kaneonuskatew Eiran" "00:15:00.000-08:00"]]

    ;; Best I can tell, MySQL's interpretation of this part of the
    ;; JDBC is way off. This doesn't return results because it looks
    ;; like it's basically double converting the time to
    ;; America/Los_Angeles. What's getting sent to the database is
    ;; 00:00 and 01:00 (which we have no data in that range). I think
    ;; we'll need to switch to their new JDBC date code to get this
    ;; fixed
    (= :mysql *engine*)
    []

    ;; Databases like PostgreSQL ignore timezone information when
    ;; using a time field, the result below is what happens when the
    ;; 08:00 time is interpreted as UTC, then not adjusted to Pacific
    ;; time by the DB
    (qpt/supports-report-timezone? *engine*)
    [[1 "Plato Yeshua" "00:30:00.000-08:00"]
     [4 "Simcha Yan" "00:30:00.000-08:00"]]

    :else
    [[1 "Plato Yeshua" "08:30:00.000Z"]
     [4 "Simcha Yan" "08:30:00.000Z"]])
  (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
    (time-query (ql/filter (apply ql/between
                                  $last_login_time
                                  (if (qpt/supports-report-timezone? *engine*)
                                    ["08:00:00" "09:00:00"]
                                    ["08:00:00-00:00" "09:00:00-00:00"]))))))
