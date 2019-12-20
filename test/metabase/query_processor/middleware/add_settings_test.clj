(ns metabase.query-processor.middleware.add-settings-test
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [test :as mt]]
            [metabase.query-processor.middleware.add-settings :as add-settings]))

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
            (is (= expected
                   (let [query        {:query? true}
                         results      {:results? true}
                         add-settings (add-settings/add-settings (constantly results))]
                     (:data (add-settings query)))))))))))

(defn- env [_]
  "SOME_VALUE")

(defprotocol Config
  (config-1 [_])
  (config-2 [_])
  (config-3 [_]))

(defn env-config []
  (reify Config
    (config-1 [_] (env :config-1))
    (config-2 [_] (env :config-2))
    (config-3 [_] (env :config-3))))

(defn- pretty-print-config-3 [config]
  (format "config 3 is '%s'" (config-3 config)))

(deftest pretty-print-config-3-test
  (is (= "config 3 is 'SOME_VALUE'"
         (pretty-print-config-3
          (reify Config
            (config-1 [_] "SOME_VALUE")
            (config-2 [_] "SOME_VALUE")
            (config-3 [_] "SOME_VALUE"))))))
