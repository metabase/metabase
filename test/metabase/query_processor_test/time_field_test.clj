(ns metabase.query-processor-test.time-field-test
  (:require [metabase
             [driver :as driver]
             [query-processor-test :as qpt]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.dataset-definitions :as defs]))

(defmacro ^:private time-query [additional-clauses]
  `(qpt/rows
     (data/with-db (data/get-or-create-database! defs/test-data-with-time)
       (data/run-mbql-query users
         ~(merge
           {:fields   `[~'$id ~'$name ~'$last_login_time]
            :order-by `[[:asc ~'$id]]}
           additional-clauses)))))

;; Basic between query on a time field
(qpt/expect-with-non-timeseries-dbs-except #{:oracle :mongo :redshift :sparksql}
  (if (= :sqlite driver/*driver*)
    [[1 "Plato Yeshua" "08:30:00"]
     [4 "Simcha Yan"   "08:30:00"]]

    [[1 "Plato Yeshua" "08:30:00.000Z"]
     [4 "Simcha Yan"   "08:30:00.000Z"]])
  (time-query {:filter [:between $last_login_time "08:00:00" "09:00:00"]}))

;; Basic between query on a time field with milliseconds
(qpt/expect-with-non-timeseries-dbs-except #{:oracle :mongo :redshift :sparksql}
  (if (= :sqlite driver/*driver*)
    [[1 "Plato Yeshua" "08:30:00"]
     [4 "Simcha Yan"   "08:30:00"]]

    [[1 "Plato Yeshua" "08:30:00.000Z"]
     [4 "Simcha Yan"   "08:30:00.000Z"]])
  (time-query {:filter [:between $last_login_time "08:00:00.000" "09:00:00.000"]}))

;; Basic > query with a time field
(qpt/expect-with-non-timeseries-dbs-except #{:oracle :mongo :redshift :sparksql}
  (if (= :sqlite driver/*driver*)
    [[3 "Kaneonuskatew Eiran" "16:15:00"]
     [5 "Quentin Sören" "17:30:00"]
     [10 "Frans Hevel" "19:30:00"]]

    [[3 "Kaneonuskatew Eiran" "16:15:00.000Z"]
     [5 "Quentin Sören" "17:30:00.000Z"]
     [10 "Frans Hevel" "19:30:00.000Z"]])
  (time-query {:filter [:> $last_login_time "16:00:00.000Z"]}))

;; Basic query with an = filter on a time field
(qpt/expect-with-non-timeseries-dbs-except #{:oracle :mongo :redshift :sparksql}
  (if (= :sqlite driver/*driver*)
    [[3 "Kaneonuskatew Eiran" "16:15:00"]]

    [[3 "Kaneonuskatew Eiran" "16:15:00.000Z"]])
  (time-query {:filter [:= $last_login_time "16:15:00.000Z"]}))

;; Query with a time filter and a report timezone
(qpt/expect-with-non-timeseries-dbs-except #{:oracle :mongo :redshift :sparksql}
  (cond
    (= :sqlite driver/*driver*)
    [[1 "Plato Yeshua" "08:30:00"]
     [4 "Simcha Yan" "08:30:00"]]

    ;; This is the correct "answer" to this query, though it doesn't
    ;; pass through JDBC. The 08:00 is adjusted to UTC (16:00), which
    ;; should yield the third item
    (= :presto driver/*driver*)
    [[3 "Kaneonuskatew Eiran" "00:15:00.000-08:00"]]

    ;; Best I can tell, MySQL's interpretation of this part of the
    ;; JDBC is way off. This doesn't return results because it looks
    ;; like it's basically double converting the time to
    ;; America/Los_Angeles. What's getting sent to the database is
    ;; 00:00 and 01:00 (which we have no data in that range). I think
    ;; we'll need to switch to their new JDBC date code to get this
    ;; fixed
    (= :mysql driver/*driver*)
    []

    ;; It looks like Snowflake is doing this conversion correctly. Snowflake's time field is stored as wall clock time
    ;; (vs. PG and others storing it without a timezone). Originally, this time is 16:15 in UTC, which is 8:15 in
    ;; pacific time. The other report timezone databases are not doing this timezone conversion.
    (= :snowflake driver/*driver*)
    [[3 "Kaneonuskatew Eiran" "08:15:00.000-08:00"]]

    ;; Databases like PostgreSQL ignore timezone information when
    ;; using a time field, the result below is what happens when the
    ;; 08:00 time is interpreted as UTC, then not adjusted to Pacific
    ;; time by the DB
    (qpt/supports-report-timezone? driver/*driver*)
    [[1 "Plato Yeshua" "00:30:00.000-08:00"]
     [4 "Simcha Yan" "00:30:00.000-08:00"]]

    :else
    [[1 "Plato Yeshua" "08:30:00.000Z"]
     [4 "Simcha Yan" "08:30:00.000Z"]])
  (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
    (time-query {:filter (vec (cons
                               :between
                               (cons
                                $last_login_time
                                (if (qpt/supports-report-timezone? driver/*driver*)
                                  ["08:00:00" "09:00:00"]
                                  ["08:00:00-00:00" "09:00:00-00:00"]))))})))
