(ns metabase.query-processor.middleware.add-timezone-info-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.middleware.add-timezone-info :as add-timezone-info]
   ;; binds mock metadata providers via the ambient store, which the code under test reads
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(driver/register! ::timezone-driver, :abstract? true)

(defmethod driver/database-supports? [::timezone-driver :set-timezone] [_driver _feature _db] true)

(driver/register! ::no-timezone-driver, :abstract? true)

(defmethod driver/database-supports? [::no-timezone-driver :set-timezone] [_driver _feature _db] false)

(defn- add-timezone-info [metadata]
  ((add-timezone-info/add-timezone-info {} identity) metadata))

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
          (qp.store/with-metadata-provider meta/metadata-provider
            (mt/with-database-timezone-id nil
              (is (= expected
                     (add-timezone-info {}))))))))))

(deftest equivalent-timezone-test
  (testing "A requested timezone that is another name for the results timezone is reported under the requested name"
    (driver/with-driver ::no-timezone-driver
      (qp.store/with-metadata-provider meta/metadata-provider
        (doseq [[report-timezone database-timezone expected-results-timezone]
                [["US/Pacific" "America/Los_Angeles" "US/Pacific"]
                 ["Etc/UTC"    "UTC"                 "Etc/UTC"]
                 ["GMT"        "UTC"                 "GMT"]
                 ;; same current offset, but different rules
                 ["US/Pacific" "America/Vancouver"   "America/Vancouver"]
                 ;; not a region ID, so keep the results timezone the frontend can use
                 ["Z"          "UTC"                 "UTC"]]]
          (mt/with-report-timezone-id! report-timezone
            (mt/with-database-timezone-id database-timezone
              (is (= {:results_timezone   expected-results-timezone
                      :requested_timezone report-timezone}
                     (add-timezone-info {}))))))))))
