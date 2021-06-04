(ns metabase.query-processor-test.date-field-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]))

(deftest dates-should-be-dates-test
  (testing "DATES should come back as LocalDates (#14504)"
    (mt/test-drivers (mt/normal-drivers)
      (is (instance?
           java.time.LocalDate
           (first
            (mt/first-row
             (qp/process-query
              (mt/query checkins
                {:query      {:fields [$date], :limit 1}
                 :middleware {:format-rows? false}})))))))))
