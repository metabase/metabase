(ns ^:mb/driver-tests metabase.query-processor.parameters.temporal-units-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defn- ->local-date-time [t]
  (as-> t $
    (cond-> $ (> (count $) 19) (subs 0 19))
    (cond-> $ (= (count $) 10) (str "T00:00:00"))
    (cond-> $ (str/includes? $ " ") (str/replace " " "T"))
    (cond-> $ (and (str/includes? $ "T")
                   (str/includes? $ "Z")) t/zoned-date-time)
    (t/local-date-time $)))

(defn- run-sample-query [query]
  (->> query
       qp/process-query
       (mt/formatted-rows [->local-date-time])))

(defmethod driver/database-supports? [::driver/driver ::temporal-units-test]
  [_driver _feature _database]
  true)

;;; sparksql expects you to use aliases when possible, and temporal unit params don't use aliases
(defmethod driver/database-supports? [:sparksql ::temporal-units-test]
  [_driver _feature _database]
  false)

(deftest ^:parallel can-compile-temporal-units-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :native-temporal-units ::temporal-units-test)
    (testing "temporal unit parameters"
      (let [base-query (mt/arbitrary-select-query driver/*driver* :orders "{{time-unit}}")
            native-query (mt/native-query
                          (assoc base-query
                                 :template-tags {"time-unit" {:name         "time-unit"
                                                              :display-name "id"
                                                              :type         :temporal-unit
                                                              :dimension    [:field (mt/id :orders :created_at) nil]}}))
            parameterized-query (assoc native-query
                                       :parameters [{:type   :temporal-unit
                                                     :name   "time-unit"
                                                     :target [:dimension [:template-tag "time-unit"]]}])
            date-types [nil "minute" "hour" "day" "week" "month" "quarter" "year"]
            count-types ["minute-of-hour" "hour-of-day" "day-of-month"
                         "day-of-year" "month-of-year" "quarter-of-year"]
            ;; The original dates are 2019-02-11T21:40:27.892 and 2018-05-15T08:04:04.580
            expected-dates [[[#t "2019-02-11T21:40:27"] [#t "2018-05-15T08:04:04"]]
                            [[#t "2019-02-11T21:40:00"] [#t "2018-05-15T08:04:00"]]
                            [[#t "2019-02-11T21:00:00"] [#t "2018-05-15T08:00:00"]]
                            [[#t "2019-02-11T00:00:00"] [#t "2018-05-15T00:00:00"]]
                            [[#t "2019-02-10T00:00:00"] [#t "2018-05-13T00:00:00"]]
                            [[#t "2019-02-01T00:00:00"] [#t "2018-05-01T00:00:00"]]
                            [[#t "2019-01-01T00:00:00"] [#t "2018-04-01T00:00:00"]]
                            [[#t "2019-01-01T00:00:00"] [#t "2018-01-01T00:00:00"]]]
            expected-counts [[[40] [4]]
                             [[21] [8]]
                             [[11] [15]]
                             [[42] [135]]
                             [[2] [5]]
                             [[1] [2]]]]
        (doseq [[grouping expected-date] (map list date-types expected-dates)]
          (is (= expected-date
                 (-> parameterized-query
                     (assoc-in [:parameters 0 :value] grouping)
                     run-sample-query
                     (subvec 0 2)))
              (str "Unexpected results for grouping " grouping)))
        (doseq [[grouping expected-count] (map list count-types expected-counts)]
          (is (= expected-count
                 (-> parameterized-query
                     (assoc-in [:parameters 0 :value] grouping)
                     qp/process-query
                     (->> (mt/formatted-rows [int]))
                     (subvec 0 2)))
              (str "Unexpected results for grouping " grouping)))))))

(deftest ^:parallel can-compile-alias-temporal-units-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :native-temporal-units)
    (testing "temporal unit parameters"
      (let [base-query (mt/arbitrary-select-query driver/*driver* :orders "{{time-unit}}")
            native-query (mt/native-query
                          (assoc base-query
                                 :template-tags {"time-unit" {:name         "time-unit"
                                                              :display-name "id"
                                                              :type         :temporal-unit
                                                              :dimension    [:field (mt/id :orders :created_at) nil]
                                                              :alias        (mt/make-alias driver/*driver* "created_at")}}))
            parameterized-query (assoc native-query
                                       :parameters [{:type   :temporal-unit
                                                     :name   "time-unit"
                                                     :target [:dimension [:template-tag "time-unit"]]}])
            date-types [nil "minute" "hour" "day" "week" "month" "quarter" "year"]
            count-types ["minute-of-hour" "hour-of-day" "day-of-month"
                         "day-of-year" "month-of-year" "quarter-of-year"]
            ;; The original dates are 2019-02-11T21:40:27.892 and 2018-05-15T08:04:04.580
            expected-dates [[[#t "2019-02-11T21:40:27"] [#t "2018-05-15T08:04:04"]]
                            [[#t "2019-02-11T21:40:00"] [#t "2018-05-15T08:04:00"]]
                            [[#t "2019-02-11T21:00:00"] [#t "2018-05-15T08:00:00"]]
                            [[#t "2019-02-11T00:00:00"] [#t "2018-05-15T00:00:00"]]
                            [[#t "2019-02-10T00:00:00"] [#t "2018-05-13T00:00:00"]]
                            [[#t "2019-02-01T00:00:00"] [#t "2018-05-01T00:00:00"]]
                            [[#t "2019-01-01T00:00:00"] [#t "2018-04-01T00:00:00"]]
                            [[#t "2019-01-01T00:00:00"] [#t "2018-01-01T00:00:00"]]]
            expected-counts [[[40] [4]]
                             [[21] [8]]
                             [[11] [15]]
                             [[42] [135]]
                             [[2] [5]]
                             [[1] [2]]]]
        (doseq [[grouping expected-date] (map list date-types expected-dates)]
          (is (= expected-date
                 (-> parameterized-query
                     (assoc-in [:parameters 0 :value] grouping)
                     run-sample-query
                     (subvec 0 2)))
              (str "Unexpected results for aliased grouping " grouping)))
        (doseq [[grouping expected-count] (map list count-types expected-counts)]
          (is (= expected-count
                 (-> parameterized-query
                     (assoc-in [:parameters 0 :value] grouping)
                     qp/process-query
                     (->> (mt/formatted-rows [int]))
                     (subvec 0 2)))
              (str "Unexpected results for aliased grouping " grouping)))))))

(deftest ^:parallel bad-field-reference-throws-errors-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :native-temporal-units ::temporal-units-test)
    (testing "temporal unit parameters"
      (let [base-query (mt/arbitrary-select-query driver/*driver* :orders "{{time-unit}}")
            query (assoc (mt/native-query
                          (assoc base-query
                                 :template-tags {"time-unit" {:name         "time-unit"
                                                              :display-name "id"
                                                              :type         :temporal-unit
                                                              :dimension    [:field 1000000000 nil]}}))
                         :parameters [{:type   :temporal-unit
                                       :name   "time-unit"
                                       :target [:variable [:template-tag "time-unit"]]
                                       :value  "year"}])]
        (mt/with-native-query-testing-context query
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                #"Can't find field with ID: 1,000,000,000"
                                (run-sample-query query))))))))

(deftest ^:parallel bad-parameter-throws-error-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :native-temporal-units ::temporal-units-test)
    (testing "temporal unit parameters"
      (let [base-query (mt/arbitrary-select-query driver/*driver* :orders "{{time-unit}}")
            query (assoc (mt/native-query
                          (assoc base-query
                                 :template-tags {"time-unit" {:name         "time-unit"
                                                              :display-name "id"
                                                              :type         :temporal-unit
                                                              :dimension    [:field (mt/id :orders :created_at) nil]}}))
                         :parameters [{:type   :temporal-unit
                                       :name   "time-unit"
                                       :target [:dimension [:template-tag "time-unit"]]
                                       :value  "foo"}])]
        (mt/with-native-query-testing-context query
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                #"invalid value specified for temporal-unit parameter"
                                (run-sample-query query))))))))
