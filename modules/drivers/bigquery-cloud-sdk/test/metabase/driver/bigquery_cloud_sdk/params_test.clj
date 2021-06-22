(ns metabase.driver.bigquery-cloud-sdk.params-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]))

(deftest set-parameters-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Make sure we're setting various types of parameters correctly\n"
      (doseq [[v expected] [[nil                                        {:base-type :type/Text}]
                            [true                                       {:base-type :type/Boolean}]
                            [false                                      {:base-type :type/Boolean}]
                            ["a string"                                 {:base-type :type/Text}]
                            [(int 100)                                  {:base-type :type/Integer}]
                            [(long 100)                                 {:base-type :type/Integer}]
                            [(short 100)                                {:base-type :type/Integer}]
                            [(byte 100)                                 {:base-type :type/Integer}]
                            [(bigint 100)                               {:base-type :type/Integer}]
                            [(float 100.0)                              {:base-type :type/Float}]
                            [(double 100.0)                             {:base-type :type/Float}]
                            [(bigdec 100.0)                             {:base-type :type/Float, :v 100.0}]
                            ;; LocalDate
                            [#t "2020-05-26"                            {:base-type :type/Date
                                                                         :v         #t "2020-05-26T00:00Z[UTC]"}]
                            ;; LocaleDateTime
                            [#t "2020-05-26T17:06:00"                   {:base-type :type/DateTime
                                                                         :v         #t "2020-05-26T17:06Z[UTC]"}]
                            ;; LocalTime
                            [#t "17:06:00"                              {:base-type :type/Time}]
                            ;; OffsetTime
                            [#t "17:06:00-07:00"                        {:base-type :type/Time
                                                                         :v         #t "00:06:00"}]
                            ;; OffsetDateTime
                            [#t "2020-05-26T17:06:00-07:00"             {:base-type :type/DateTimeWithLocalTZ
                                                                         :v         #t "2020-05-27T00:06Z[UTC]"}]
                            ;; ZonedDateTime
                            [#t "2020-05-26T17:06:00-07:00[US/Pacific]" {:base-type :type/DateTimeWithLocalTZ
                                                                         :v         #t "2020-05-27T00:06Z[UTC]"}]]]
        (testing (format "^%s %s" (some-> v class .getCanonicalName) (pr-str v))
          (let [results (qp/process-query
                         (assoc (mt/native-query
                                  {:query  "SELECT ?"
                                   :params [v]})
                                :middleware {:format-rows? false}))]
            (is (= (or (:v expected) v)
                   (first (mt/first-row results))))
            (is (= (:base-type expected)
                   (-> (mt/cols results) first :base_type)))))))))
