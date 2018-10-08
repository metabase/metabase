(ns metabase.query-processor.middleware.add-settings-test
  (:require [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.models.setting :as setting]
            [metabase.query-processor.middleware.add-settings :as add-settings]))

(defrecord ^:private TestDriver []
  clojure.lang.Named
  (getName [_] "TestDriver"))

(extend TestDriver
  driver/IDriver
  {:features (constantly #{:set-timezone})})

(expect
  [{:settings {}}
   {:settings {}}
   {:settings {:report-timezone "US/Mountain"}}]
  (let [original-tz (setting/get :report-timezone)
        response1   ((add-settings/add-settings identity) {:driver (TestDriver.)})]
    ;; make sure that if the timezone is an empty string we skip it in settings
    (setting/set! :report-timezone "")
    (let [response2 ((add-settings/add-settings identity) {:driver (TestDriver.)})]
      ;; if the timezone is something valid it should show up in the query settings
      (setting/set! :report-timezone "US/Mountain")
      (let [response3 ((add-settings/add-settings identity) {:driver (TestDriver.)})]
        (setting/set! :report-timezone original-tz)
        [(dissoc response1 :driver)
         (dissoc response2 :driver)
         (dissoc response3 :driver)]))))
