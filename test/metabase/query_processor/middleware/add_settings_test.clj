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
  (let [add-settings (fn []
                       (driver/with-driver ::timezone-driver
                         (let [query        {:query? true}
                               results      {:results? true}
                               add-settings (add-settings/add-settings (constantly results))]
                           (add-settings query))))]
    (is (= {:results?        true
            :report_timezone "US/Pacific"}
           (tu/with-temporary-setting-values [report-timezone "US/Pacific"]
             (add-settings)))
        "`report_timezone` should be returned as part of the query results")
    (is (= {:results? true}
           (add-settings))
        "Don't add `report_timezone` if it is unset")))
