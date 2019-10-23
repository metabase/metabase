(ns metabase.query-processor.middleware.add-settings-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.query-processor.middleware.add-settings :as add-settings]
            [metabase.test.util :as tu]
            [metabase.util.date :as du]))

(driver/register! ::timezone-driver, :abstract? true)

(defmethod driver/supports? [::timezone-driver :set-timezone] [_ _] true)

(driver/register! ::no-timezone-driver, :abstract? true)

(defmethod driver/supports? [::no-timezone-driver :set-timezone] [_ _] false)

(deftest pre-processing-test
  (let [add-settings (fn [timezone driver query]
                       (tu/with-temporary-setting-values [report-timezone timezone]
                         (binding [du/*report-timezone* (when (driver/supports? driver :set-timezone)
                                                          (some-> ^String timezone java.util.TimeZone/getTimeZone))]
                           (let [pre-processed (atom nil)]
                             (driver/with-driver driver
                               ((add-settings/add-settings (partial reset! pre-processed)) query))
                             @pre-processed))))]
    (is (= {}
           (add-settings nil ::timezone-driver {}))
        "no `report-timezone` set = query should not be changed")
    (is (= {:settings {:report-timezone "US/Mountain"}}
           (add-settings "US/Mountain" ::timezone-driver {}))
        "if the timezone is something valid it should show up in the query settings")
    (is (= {}
           (add-settings "US/Mountain" ::no-timezone-driver {}))
        "if the driver doesn't support `:set-timezone`, query should be unchanged, even if `report-timezone` is valid")))

(deftest post-processing-test
  (doseq [[driver timezone->expected] {::timezone-driver    {"US/Pacific" {:actual_timezone   "US/Pacific"
                                                                           :expected_timezone "US/Pacific"}
                                                             nil          {:actual_timezone "UTC"}}
                                       ::no-timezone-driver {"US/Pacific" {:actual_timezone   "UTC"
                                                                           :expected_timezone "US/Pacific"}
                                                             nil          {:actual_timezone "UTC"}}}
          [timezone expected]         timezone->expected]
    (testing driver
      (tu/with-temporary-setting-values [report-timezone timezone]
        (driver/with-driver driver
          (binding [du/*report-timezone* (when (driver/supports? driver :set-timezone)
                                           (some-> ^String timezone java.util.TimeZone/getTimeZone))]
            (is (= (assoc expected :results? true)
                   (let [query        {:query? true}
                         results      {:results? true}
                         add-settings (add-settings/add-settings (constantly results))]
                     (add-settings query))))))))))

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
