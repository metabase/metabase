(ns metabase.query-processor.middleware.add-settings-test
  (:require [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.query-processor.middleware.add-settings :as add-settings]
            [metabase.test.util :as tu]))

(driver/register! ::timezone-driver, :abstract? true)

(defmethod driver/supports? [::timezone-driver :set-timezone] [_ _] true)

(driver/register! ::no-timezone-driver, :abstract? true)

(defmethod driver/supports? [::no-timezone-driver :set-timezone] [_ _] false)

(defn- add-settings [driver query]
  (driver/with-driver driver
    ((add-settings/add-settings identity) query)))

;; no `report-timezone` set = query should not be changed
(expect
  {}
  (tu/with-temporary-setting-values [report-timezone nil]
    (add-settings ::timezone-driver {})))

;; `report-timezone` is an empty string = query should not be changed
(expect
  {}
  (tu/with-temporary-setting-values [report-timezone ""]
    (add-settings ::timezone-driver {})))

;; if the timezone is something valid it should show up in the query settings
(expect
  {:settings {:report-timezone "US/Mountain"}}
  (tu/with-temporary-setting-values [report-timezone "US/Mountain"]
    (add-settings ::timezone-driver {})))

;; if the driver doesn't support `:set-timezone`, query should be unchanged, even if `report-timezone` is valid
(expect
  {}
  (tu/with-temporary-setting-values [report-timezone "US/Mountain"]
    (add-settings ::no-timezone-driver {})))
