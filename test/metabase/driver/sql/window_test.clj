(ns ^:mb/driver-tests metabase.driver.sql.window-test
  "End-to-end compile + run tests for the :window MBQL expression clause."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util.notebook-helpers :as nb]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]))

(defn- checkins-base []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :checkins)))))

(defn- col-ref
  "Fresh column ref by display name. The 2-arity version picks the base table's group — its display name is
  schema-prefixed on some drivers (e.g. \"Test Data Checkins\" on Oracle/Presto/Vertica), so match on
  `{:is-main-group true}` instead."
  ([query display-name]
   (col-ref query {:is-main-group true} display-name))
  ([query group-spec display-name]
   (lib/ref (nb/find-col-with-spec query (lib/visible-columns query) group-spec display-name))))

(defn- window-drivers []
  (mt/normal-driver-select {:+features [:window-functions] :+parent :sql}))

(deftest ^:parallel compile-row-number-test
  (testing "ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date ASC)"
    (mt/test-drivers (window-drivers)
      (let [base  (checkins-base)
            query (lib/expression base "rn"
                                  (lib/window (lib/row-number)
                                              {:partition-by [(col-ref base "User ID")]
                                               :order-by     [[(col-ref base "Date") :asc]]}))
            sql   (:query (qp.compile/compile query))]
        (is (re-find #"(?i)ROW_NUMBER\s*\(\s*\)\s*OVER" sql))
        (is (re-find #"(?i)PARTITION\s+BY" sql))
        (is (re-find #"(?i)ORDER\s+BY" sql))))))

(deftest ^:parallel compile-all-window-only-heads-test
  (testing "every window-only head compiles to its SQL function"
    (mt/test-drivers (window-drivers)
      (doseq [[inner-fn expected-fn] [[lib/rank         #"(?i)\bRANK\s*\("]
                                      [lib/dense-rank   #"(?i)DENSE_RANK\s*\("]
                                      [lib/percent-rank #"(?i)PERCENT_RANK\s*\("]
                                      [lib/cume-dist    #"(?i)CUME_DIST\s*\("]]]
        (let [base  (checkins-base)
              query (lib/expression base "r"
                                    (lib/window (inner-fn)
                                                {:partition-by [(col-ref base "User ID")]
                                                 :order-by     [[(col-ref base "Date") :asc]]}))
              sql   (:query (qp.compile/compile query))]
          (is (re-find expected-fn sql)))))))

(deftest ^:parallel compile-first-last-nth-value-test
  (testing "FIRST_VALUE, LAST_VALUE, NTH_VALUE compile"
    (mt/test-drivers (window-drivers)
      (doseq [[inner-fn args expected-fn] [[lib/first-value [] #"(?i)FIRST_VALUE\s*\("]
                                           [lib/last-value  [] #"(?i)LAST_VALUE\s*\("]
                                           [lib/nth-value   [2] #"(?i)NTH_VALUE\s*\("]]]
        (let [base  (checkins-base)
              query (lib/expression base "v"
                                    (lib/window (apply inner-fn (col-ref base "Venue ID") args)
                                                {:order-by [[(col-ref base "Date") :asc]]}))
              sql   (:query (qp.compile/compile query))]
          (is (re-find expected-fn sql)))))))

(deftest ^:parallel compile-ntile-test
  (testing "NTILE(4) compiles on drivers that advertise :window-functions/ntile"
    (mt/test-drivers (mt/normal-driver-select {:+features [:window-functions/ntile] :+parent :sql})
      (let [base  (checkins-base)
            query (lib/expression base "q"
                                  (lib/window (lib/ntile 4)
                                              {:order-by [[(col-ref base "Date") :asc]]}))
            sql   (:query (qp.compile/compile query))]
        (is (re-find #"(?i)NTILE\s*\(\s*4\s*\)" sql))))))

(deftest ^:parallel compile-frame-between-preceding-and-following-test
  (testing "ROWS BETWEEN 3 PRECEDING AND 2 FOLLOWING"
    (mt/test-drivers (window-drivers)
      (let [base  (checkins-base)
            query (lib/expression base "window_sum"
                                  (lib/window (lib/sum (col-ref base "Venue ID"))
                                              {:order-by [[(col-ref base "Date") :asc]]
                                               :frame    {:type  :rows
                                                          :start [:preceding 3]
                                                          :end   [:following 2]}}))
            sql   (:query (qp.compile/compile query))]
        (is (re-find #"(?i)ROWS\s+BETWEEN\s+3\s+PRECEDING\s+AND\s+2\s+FOLLOWING" sql))))))

(deftest ^:parallel compile-lag-test
  (testing "LAG(date, 1) OVER (PARTITION BY user_id ORDER BY date)"
    (mt/test-drivers (window-drivers)
      (let [base  (checkins-base)
            query (lib/expression base "prev_ts"
                                  (lib/window (lib/lag (col-ref base "Date") 1)
                                              {:partition-by [(col-ref base "User ID")]
                                               :order-by     [[(col-ref base "Date") :asc]]}))
            sql   (:query (qp.compile/compile query))]
        (is (re-find #"(?i)LAG" sql))
        (is (re-find #"(?i)PARTITION\s+BY" sql))))))

(deftest ^:parallel compile-lead-test
  (testing "LEAD(date, 2) OVER (ORDER BY date)"
    (mt/test-drivers (window-drivers)
      (let [base  (checkins-base)
            query (lib/expression base "next_ts"
                                  (lib/window (lib/lead (col-ref base "Date") 2)
                                              {:order-by [[(col-ref base "Date") :asc]]}))
            sql   (:query (qp.compile/compile query))]
        (is (re-find #"(?i)LEAD" sql))))))

(deftest ^:parallel compile-sum-with-rows-frame-test
  (testing "SUM(venue_id) OVER (PARTITION BY user_id ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)"
    (mt/test-drivers (window-drivers)
      (let [base  (checkins-base)
            query (lib/expression base "rolling_sum"
                                  (lib/window (lib/sum (col-ref base "Venue ID"))
                                              {:partition-by [(col-ref base "User ID")]
                                               :order-by     [[(col-ref base "Date") :asc]]
                                               :frame        {:type  :rows
                                                              :start [:preceding 6]
                                                              :end   :current-row}}))
            sql   (:query (qp.compile/compile query))]
        (is (re-find #"(?i)SUM" sql))
        (is (re-find #"(?i)ROWS\s+BETWEEN\s+6\s+PRECEDING\s+AND\s+CURRENT\s+ROW" sql))))))

(deftest ^:parallel compile-range-frame-test
  (testing ":range frame compiles"
    (mt/test-drivers (window-drivers)
      (let [base  (checkins-base)
            query (lib/expression base "running"
                                  (lib/window (lib/sum (col-ref base "Venue ID"))
                                              {:order-by [[(col-ref base "Date") :asc]]
                                               :frame    {:type  :range
                                                          :start :unbounded-preceding
                                                          :end   :current-row}}))
            sql   (:query (qp.compile/compile query))]
        (is (re-find #"(?i)RANGE\s+BETWEEN\s+UNBOUNDED\s+PRECEDING\s+AND\s+CURRENT\s+ROW" sql))))))

(deftest ^:parallel range-frame-with-interval-offset-test
  (testing "a RANGE frame with an interval offset compiles and runs correctly — the canonical rolling
            temporal window pattern (habit/cohort use case)."
    (mt/test-drivers (mt/normal-driver-select {:+features [:window-functions/interval-frame-offsets]
                                               :+parent   :sql})
      (let [base  (checkins-base)
            query (-> (lib/expression base "events_7d"
                                      (lib/window (lib/count)
                                                  {:order-by [[(col-ref base "Date") :asc]]
                                                   :frame    {:type  :range
                                                              :start [:preceding (lib/interval 7 :day)]
                                                              :end   :current-row}}))
                      (lib/limit 10))
            sql   (:query (qp.compile/compile query))]
        (is (re-find #"(?i)RANGE\s+BETWEEN\s+INTERVAL\s+(?:'7'\s+day|'7 day'|7\s+day)\s+PRECEDING\s+AND\s+CURRENT\s+ROW" sql))
        (mt/with-native-query-testing-context query
          (let [rows (mt/formatted-rows [identity identity int int int]
                                        (qp/process-query query))]
            (is (seq rows))
            (is (every? (fn [row] (<= 1 (last row))) rows)
                "the rolling count includes at least the current row, so every value is >= 1")))))))

(deftest ^:parallel compile-groups-frame-test
  (testing ":groups frame compiles — peer-group offsets instead of row or value offsets"
    (mt/test-drivers (window-drivers)
      (let [base  (checkins-base)
            query (lib/expression base "peers"
                                  (lib/window (lib/sum (col-ref base "Venue ID"))
                                              {:order-by [[(col-ref base "Date") :asc]]
                                               :frame    {:type  :groups
                                                          :start [:preceding 1]
                                                          :end   :current-row}}))
            sql   (:query (qp.compile/compile query))]
        (is (re-find #"(?i)GROUPS\s+BETWEEN\s+1\s+PRECEDING\s+AND\s+CURRENT\s+ROW" sql))))))

(deftest ^:parallel compile-exclude-test
  (testing ":exclude clause compiles where driver supports it"
    (mt/test-drivers (mt/normal-driver-select {:+features [:window-functions/exclude] :+parent :sql})
      (let [base  (checkins-base)
            query (lib/expression base "running"
                                  (lib/window (lib/sum (col-ref base "Venue ID"))
                                              {:order-by [[(col-ref base "Date") :asc]]
                                               :frame    {:type    :rows
                                                          :start   :unbounded-preceding
                                                          :end     :current-row
                                                          :exclude :current-row}}))
            sql   (:query (qp.compile/compile query))]
        (is (re-find #"(?i)EXCLUDE\s+CURRENT\s+ROW" sql))))))

(deftest ^:parallel row-number-runs-test
  (testing "row-number produces positive integers per actor"
    (mt/test-drivers (window-drivers)
      (let [base  (checkins-base)
            rn    (lib/window (lib/row-number)
                              {:partition-by [(col-ref base "User ID")]
                               :order-by     [[(col-ref base "Date") :asc]]})
            query (-> (lib/expression base "rn" rn)
                      (lib/limit 100))]
        (mt/with-native-query-testing-context query
          ;; coerce trailing rn column to int so BigDecimal results (e.g. ClickHouse) compare equal
          (let [rows (mt/formatted-rows [identity identity int int int]
                                        (qp/process-query query))]
            (is (seq rows))
            (is (every? pos-int? (map last rows)))))))))

(deftest ^:parallel scoped-events-with-window-test
  (testing "the product-analytics shape: CTE scopes events, main stage numbers them per actor"
    (mt/test-drivers (mt/normal-driver-select {:+features [:stage-ctes :window-functions] :+parent :sql})
      (let [scoped (lib/wrap-as-cte (checkins-base) "scoped_events")
            rank   (lib/window (lib/row-number)
                               {:partition-by [(col-ref scoped "scoped_events" "User ID")]
                                :order-by     [[(col-ref scoped "scoped_events" "Date") :asc]]})
            query  (-> (lib/expression scoped "event_rank" rank)
                       (lib/limit 100))]
        (mt/with-native-query-testing-context query
          (let [sql  (:query (qp.compile/compile query))
                rows (mt/formatted-rows [identity identity int int int]
                                        (qp/process-query query))]
            (is (re-find #"(?i)WITH\s+[\"`]?scoped_events[\"`]?\s+AS" sql))
            (is (re-find #"(?i)ROW_NUMBER\s*\(\s*\)\s*OVER" sql))
            (is (seq rows))
            (is (every? pos-int? (map last rows)))))))))

(deftest ^:parallel habit-percentage-test
  (testing "habit percentage per day: `100 * habituated_rows / total_rows`, where a habituated row is
            one whose user had >= 3 events in the last 7 rows (including itself). The CTE computes the
            per-row rolling count via a window; the main stage breaks out by day and divides."
    (mt/test-drivers (mt/normal-driver-select {:+features [:stage-ctes :window-functions] :+parent :sql})
      (let [base       (checkins-base)
            events-7d  (lib/window (lib/count)
                                   {:partition-by [(col-ref base "User ID")]
                                    :order-by     [[(col-ref base "Date") :asc]]
                                    :frame        {:type  :rows
                                                   :start [:preceding 6]
                                                   :end   :current-row}})
            activity   (-> (lib/expression base "events_7d" events-7d)
                           (lib/wrap-as-cte "activity"))
            events-ref (col-ref activity "activity" "events_7d")
            habit-pct  (lib/* 100.0 (lib// (lib/count-where (lib/>= events-ref 3))
                                           (lib/count)))
            query      (-> activity
                           (lib/breakout (col-ref activity "activity" "Date"))
                           (lib/aggregate habit-pct))
            sql        (:query (qp.compile/compile query))]
        (is (re-find #"(?i)WITH\s+[\"`]?activity[\"`]?\s+AS" sql))
        (is (re-find #"(?i)COUNT\s*\(\s*\*?\s*\)\s*OVER" sql))
        (is (re-find #"(?i)ROWS\s+BETWEEN\s+6\s+PRECEDING\s+AND\s+CURRENT\s+ROW" sql))
        (is (re-find #"(?i)100\.0\s*\*" sql))
        (mt/with-native-query-testing-context query
          (let [rows (mt/formatted-rows [identity double]
                                        (qp/process-query query))]
            (is (seq rows) "query returns rows")
            (is (every? (fn [[_date pct]] (<= 0.0 pct 100.0)) rows)
                "every habit percentage is in [0, 100]")
            (is (some (fn [[_date pct]] (pos? pct)) rows)
                "at least one day has a nonzero habit percentage in test-data")))))))
