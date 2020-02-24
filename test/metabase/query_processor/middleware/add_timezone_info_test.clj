(ns metabase.query-processor.middleware.add-timezone-info-test
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [test :as mt]]
            [metabase.query-processor.middleware.add-timezone-info :as add-timezone-info]))

(driver/register! ::timezone-driver, :abstract? true)

(defmethod driver/supports? [::timezone-driver :set-timezone] [_ _] true)

(driver/register! ::no-timezone-driver, :abstract? true)

(defmethod driver/supports? [::no-timezone-driver :set-timezone] [_ _] false)

(deftest post-processing-test
  (doseq [[driver timezone->expected] {::timezone-driver    {"US/Pacific" {:results_timezone   "US/Pacific"
                                                                           :requested_timezone "US/Pacific"}
                                                             nil          {:results_timezone "UTC"}}
                                       ::no-timezone-driver {"US/Pacific" {:results_timezone   "UTC"
                                                                           :requested_timezone "US/Pacific"}
                                                             nil          {:results_timezone "UTC"}}}
          [timezone expected]         timezone->expected]
    (testing driver
      (mt/with-temporary-setting-values [report-timezone timezone]
        (driver/with-driver driver
          (mt/with-database-timezone-id nil
            (is (= {:data      expected
                    :row_count 0
                    :status    :completed}
                   (-> (mt/test-qp-middleware add-timezone-info/add-timezone-info {} {} [])
                       :metadata)))))))))
