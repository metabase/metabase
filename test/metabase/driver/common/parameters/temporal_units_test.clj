(ns ^:mb/driver-tests metabase.driver.common.parameters.temporal-units-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(defn- ->local-date [t]
  (cond-> t
    (str/includes? t "T") (t/zoned-date-time)
    true t/local-date))

(defn- run-sample-query [query]
  (->> query
       qp/process-query
       (mt/formatted-rows [->local-date])))

(deftest can-compile-temporal-units-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :native-temporal-units)
    (testing "temporal unit parameters"
      (let [field-reference (qp.store/with-metadata-provider (mt/metadata-provider)
                              (mt/field-reference driver/*driver* (mt/id :orders :created_at)))
            base-query (mt/arbitrary-select-query driver/*driver* :orders (format "{{mb.time_grouping('time-unit', '%s')}}" field-reference))
            native-query (mt/native-query
                           (assoc base-query
                                  :template-tags {"time-unit" {:name "id"
                                                               :display-name "id"
                                                               :type         :temporal-unit}}))
            year-query (assoc native-query
                              :parameters [{:type   :temporal-unit
                                            :name   "time-unit"
                                            :target [:dimension [:template-tag "time-unit"]]
                                            :value  "year"}])
            month-query (assoc native-query
                               :parameters [{:type   :temporal-unit
                                             :name   "time-unit"
                                             :target [:dimension [:template-tag "time-unit"]]
                                             :value  "month"}])]
        (mt/with-native-query-testing-context year-query
          (is (= [[#t "2019-01-01"]
                  [#t "2018-01-01"]
                  [#t "2019-01-01"]]
                 (run-sample-query year-query))))
        (mt/with-native-query-testing-context month-query
          (is (= [[#t "2019-02-01"]
                  [#t "2018-05-01"]
                  [#t "2019-12-01"]]
                 (run-sample-query month-query))))))))

(deftest bad-function-names-throw-errors-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :native-temporal-units)
    (testing "temporal unit parameters"
      (let [base-query (mt/arbitrary-select-query driver/*driver* :orders (format "{{mb.bad_function_name('time-unit', %s)}}" "'created_at'"))
            query (assoc (mt/native-query
                           (assoc base-query
                                  :template-tags {"time-unit" {:name "id"
                                                               :display-name "id"
                                                               :type         :temporal-unit}}))
                         :parameters [{:type   :temporal-unit
                                       :name   "time-unit"
                                       :target [:dimension [:template-tag "time-unit"]]
                                       :value  "year"}])]
        (mt/with-native-query-testing-context query
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unrecognized function: mb.bad_function_name"
                                (run-sample-query query))))))))

(deftest bad-parameter-throws-error-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :native-temporal-units)
    (testing "temporal unit parameters"
      (let [base-query (mt/arbitrary-select-query driver/*driver* :orders (format "{{mb.time_grouping('time-unit', %s)}}" "'created_at'"))
            query (assoc (mt/native-query
                           (assoc base-query
                                  :template-tags {"time-unit" {:name "id"
                                                               :display-name "id"
                                                               :type         :temporal-unit}}))
                         :parameters [{:type   :temporal-unit
                                       :name   "time-unit"
                                       :target [:dimension [:template-tag "time-unit"]]
                                       :value  "foo"}])]
        (mt/with-native-query-testing-context query
          (is (thrown? clojure.lang.ExceptionInfo
                       (run-sample-query query))))))))
