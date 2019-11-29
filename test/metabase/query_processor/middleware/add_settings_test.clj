(ns metabase.query-processor.middleware.add-settings-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.query-processor.middleware.add-settings :as add-settings]
            [metabase.test.util :as tu]))

(driver/register! ::timezone-driver, :abstract? true)

(defmethod driver/supports? [::timezone-driver :set-timezone] [_ _] true)

(driver/register! ::no-timezone-driver, :abstract? true)

(defmethod driver/supports? [::no-timezone-driver :set-timezone] [_ _] false)

(deftest pre-processing-test
  (let [add-settings (fn [driver query]
                       (let [pre-processed (atom nil)]
                         (driver/with-driver driver
                           ((add-settings/add-settings (partial reset! pre-processed)) query))
                         @pre-processed))]
    (is (= {}
           (tu/with-temporary-setting-values [report-timezone nil]
             (add-settings ::timezone-driver {})))
        "no `report-timezone` set = query should not be changed")
    (is (= {}
           (tu/with-temporary-setting-values [report-timezone ""]
             (add-settings ::timezone-driver {})))
        "`report-timezone` is an empty string = query should not be changed")
    (is (= {:settings {:report-timezone "US/Mountain"}}
           (tu/with-temporary-setting-values [report-timezone "US/Mountain"]
             (add-settings ::timezone-driver {})))
        "if the timezone is something valid it should show up in the query settings")
    (is (= {}
           (tu/with-temporary-setting-values [report-timezone "US/Mountain"]
             (add-settings ::no-timezone-driver {})))
        "if the driver doesn't support `:set-timezone`, query should be unchanged, even if `report-timezone` is valid")))

(deftest post-processing-test
  (doseq [[driver timezone->expected] {::timezone-driver    {"US/Pacific" {:results_timezone   "US/Pacific"
                                                                           :requested_timezone "US/Pacific"}
                                                             nil          {:results_timezone   "UTC"
                                                                           :requested_timezone "UTC"}}
                                       ::no-timezone-driver {"US/Pacific" {:results_timezone   "UTC"
                                                                           :requested_timezone "US/Pacific"}
                                                             nil          {:results_timezone   "UTC"
                                                                           :requested_timezone "UTC"}}}
          [timezone expected]         timezone->expected]
    (testing driver
      (tu/with-temporary-setting-values [report-timezone timezone]
        (driver/with-driver driver
          (is (= expected
                 (let [query        {:query? true}
                       results      {:results? true}
                       add-settings (add-settings/add-settings (constantly results))]
                   (:data (add-settings query))))))))))

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
