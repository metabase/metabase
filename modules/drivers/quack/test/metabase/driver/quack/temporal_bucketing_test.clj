(ns metabase.driver.quack.temporal-bucketing-test
  "Regression tests for temporal bucketing (date truncation/extraction).

  These guard against two bugs:
  1. \"No method in multimethod 'date' for dispatch value: [:quack :hour]\"
     — temporal units weren't implemented for the :quack driver.
  2. \"You can't bucket a :type/Time Field by :day\" — TIMESTAMP columns were
     mistyped as :type/Time because 'timestamp' was matched by the 'time'
     prefix in the data-type table.

  Run standalone (needs Metabase classpath):
     clojure -A:dev:drivers:drivers-dev -m metabase.driver.quack.temporal-bucketing-test"
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.driver :as driver]
   [metabase.driver.quack :as quack]
   [metabase.driver.quack.client :as client]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.test.data.quack :as qtd]
   [metabase.util.honey-sql-2 :as h2x])
  (:import [java.net Socket]))

(set! *warn-on-reflection* true)
(driver/initialize! :quack)

(def details qtd/default-details)
(def ^:private dummy-expr (h2x/identifier :field "t" "ts"))

(defn- date-result
  "Call sql.qp/date for :quack + unit on a dummy field; return the HoneySQL form."
  [unit]
  (sql.qp/date :quack unit dummy-expr))

(defn- raw-sql?
  "True if `form` is a raw SQL vector like [:date_trunc ...] or [:date_part ...]."
  [form]
  (and (vector? form) (keyword? (first form))))

;;; ===========================================================================
;;; Bug 1: temporal bucketing methods exist for every unit
;;; ===========================================================================

(deftest add-interval-method-exists-test
  (testing "the add-interval-honeysql-form method is registered (regression: 'No method in multimethod')"
    (is (some? (get-method sql.qp/add-interval-honeysql-form :quack))
        "add-interval-honeysql-form must be implemented for :quack")))

(deftest add-interval-produces-raw-sql-test
  (testing "add-interval uses DuckDB's INTERVAL syntax (regression for 'previous N days' filters)"
    (let [result (sql.qp/add-interval-honeysql-form :quack dummy-expr 30 :day)]
      (is (and (vector? result) (= :+ (first result)))
          "result is a + HoneySQL form"))))

(deftest all-truncation-units-have-methods-test
  (testing "every temporal truncation unit has a registered :quack date method
            (regression: this used to throw 'No method in multimethod')"
    (doseq [unit [:second :minute :hour :day :week :month :quarter :year]]
      (is (some? (get-method sql.qp/date [:quack unit]))
          (str "missing date method for unit " unit)))))

(deftest all-extraction-units-have-methods-test
  (testing "every temporal extraction unit has a registered :quack date method"
    (doseq [unit [:second-of-minute :minute-of-hour :hour-of-day
                  :day-of-month :day-of-year :day-of-week
                  :week-of-year :month-of-year :quarter-of-year :year-of-era]]
      (is (some? (get-method sql.qp/date [:quack unit]))
          (str "missing date method for unit " unit)))))

;;; ===========================================================================
;;; Bug 1 (continued): the methods produce correct DuckDB SQL
;;; ===========================================================================

(deftest truncation-produces-date-trunc-test
  (testing "truncation units use DuckDB's date_trunc function"
    (is (= :date_trunc (first (date-result :hour))))
    (is (= :date_trunc (first (date-result :month))))
    (is (= :date_trunc (first (date-result :quarter))))
    (is (= :date_trunc (first (date-result :year))))))

(deftest day-truncation-produces-cast-test
  (testing ":day truncation uses CAST (h2x/->date)"
    ;; h2x/->date wraps in a cast form; just check it's not date_trunc
    (is (not= :date_trunc (first (date-result :day))))))

(deftest extraction-produces-date-part-test
  (testing "extraction units use DuckDB's date_part function"
    (is (raw-sql? (date-result :hour-of-day)))
    (is (raw-sql? (date-result :month-of-year)))
    (is (raw-sql? (date-result :day-of-week)))))

;;; ===========================================================================
;;; Bug 2: data-type->base-type prefix ordering (TIMESTAMP vs TIME)
;;; ===========================================================================
;; The data-type map uses prefix matching: "timestamp" starts with "time",
;; so "timestamp" MUST appear before "time" in the list or every TIMESTAMP
;; column gets mistyped as :type/Time — which causes Metabase to reject
;; day/week/month bucketing with "You can't bucket a :type/Time Field by :day".

(deftest timestamp-type-not-confused-with-time-test
  (testing "TIMESTAMP maps to :type/DateTime, NOT :type/Time (prefix-order regression)"
    ;; This is the exact bug: "timestamp" was caught by the "time" prefix.
    (is (= :type/DateTime (#'quack/data-type->base-type "TIMESTAMP"))
        "TIMESTAMP must be :type/DateTime — was wrongly :type/Time before the fix")
    (is (= :type/DateTime (#'quack/data-type->base-type "timestamp"))
        "lowercase timestamp must also work")
    (is (= :type/DateTime (#'quack/data-type->base-type "TIMESTAMP WITH TIME ZONE"))
        "full type strings starting with TIMESTAMP must also resolve to DateTime")))

(deftest time-type-is-still-correct-test
  (testing "TIME maps to :type/Time (not affected by the fix)"
    (is (= :type/Time (#'quack/data-type->base-type "TIME")))
    (is (= :type/Time (#'quack/data-type->base-type "time")))))

(deftest all-data-type-prefixes-correct-test
  (testing "the full data-type table resolves every common DuckDB type correctly"
    (are [data-type expected] (= expected (#'quack/data-type->base-type data-type))
      "BOOLEAN"       :type/Boolean
      "TINYINT"       :type/Integer
      "SMALLINT"      :type/Integer
      "INTEGER"       :type/Integer
      "BIGINT"        :type/BigInteger
      "DECIMAL(10,2)" :type/Decimal
      "FLOAT"         :type/Float
      "DOUBLE"        :type/Float
      "DATE"          :type/Date
      "TIMESTAMP"     :type/DateTime
      "TIME"          :type/Time
      "VARCHAR"       :type/Text
      "UUID"          :type/UUID
      "BLOB"          :type/*)))

;;; ===========================================================================
;;; Bug 3 (end-to-end): live temporal queries through the Quack server
;;; ===========================================================================

(defn- reachable? []
  (try (with-open [_ (Socket. ^String (:host details) ^int (:port details))] true)
       (catch Exception _ false)))

(deftest ^:live live-temporal-breakout-test
  (when (reachable?)
    (testing "an MBQL temporal breakout (group by hour) runs through the live server"
      (let [{:keys [rows]} (client/execute-query details
                                                 "SELECT date_trunc('hour', created_at) AS h, count(*) AS n
                             FROM pgsrc.public.people GROUP BY 1 ORDER BY 1 LIMIT 3")
            n (reduce (fn [c _] (inc c)) 0 rows)]
        (is (pos? n) "temporal breakout returns rows")))))

(deftest ^:live live-temporal-filter-test
  (when (reachable?)
    (testing "a temporal filter (WHERE created_at >= ...) runs through the live server"
      (let [{:keys [rows]} (client/execute-query details
                                                 "SELECT count(*) AS n FROM pgsrc.public.people
                             WHERE created_at >= date_trunc('year', current_date) - INTERVAL '20 years'")
            total (ffirst (reduce conj [] rows))]
        (is (pos? total) "temporal filter returns a positive count")))))
