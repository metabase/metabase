(ns metabase.query-processor.middleware.bind-effective-timezone-test
  (:require [expectations :refer [expect]]
            [metabase.models.database :refer [Database]]
            [metabase.query-processor.middleware.bind-effective-timezone :as bind-effective-timezone]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [metabase.util.date :as du]
            [toucan.util.test :as tt]))

(expect
  "US/Hawaii"
  (let [bound-timezone (atom nil)]
    (tt/with-temp Database [db {:engine :postgres}]
      (tu/with-temporary-setting-values [report-timezone "US/Hawaii"]
        ((bind-effective-timezone/bind-effective-timezone (fn [_] (reset! bound-timezone du/*report-timezone*)))
         {:database (u/get-id db)})))
    (when-let [^java.util.TimeZone timezone @bound-timezone]
      (.getID timezone))))
