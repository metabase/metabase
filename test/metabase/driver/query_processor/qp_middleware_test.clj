(ns metabase.driver.query_processor.qp-middleware-test
  (:require [expectations :refer :all]
            [clj-time.coerce :as tc]
            [metabase.driver :as driver]
            [metabase.driver.query-processor :refer :all]
            [metabase.models.setting :as setting]
            [metabase.test.util :refer [resolve-private-fns]]))

(resolve-private-fns metabase.driver.query-processor post-format-rows pre-add-settings)


(defrecord TestDriver []
  clojure.lang.Named
  (getName [_] "TestDriver"))

(extend TestDriver
  driver/IDriver
  {:features (constantly #{:set-timezone})})


;; pre-add-settings

(expect
  [{:settings {}}
   {:settings {}}
   {:settings {:report-timezone "US/Mountain"}}]
  (let [original-tz (setting/get :report-timezone)
        response1   ((pre-add-settings identity) {:driver (TestDriver.)})]
    ;; make sure that if the timezone is an empty string we skip it in settings
    (setting/set :report-timezone "")
    (let [response2 ((pre-add-settings identity) {:driver (TestDriver.)})]
      ;; if the timezone is something valid it should show up in the query settings
      (setting/set :report-timezone "US/Mountain")
      (let [response3 ((pre-add-settings identity) {:driver (TestDriver.)})]
        (if original-tz
          (setting/set :report-timezone original-tz)
          (setting/delete :report-timezone))
        [(dissoc response1 :driver)
         (dissoc response2 :driver)
         (dissoc response3 :driver)]))))


;; post-format-rows

(expect
  {:rows [["2011-04-18T10:12:47.232Z"]
          ["2011-04-18T00:00:00.000Z"]
          ["2011-04-18T10:12:47.232Z"]]}
  ((post-format-rows (constantly {:rows [[(tc/to-sql-time 1303121567232)]
                                         [(tc/to-sql-date "2011-04-18")] ; joda-time assumes this is UTC time when parsing it
                                         [(tc/to-date 1303121567232)]]})) {:settings {}}))

(expect
  {:rows [["2011-04-18T19:12:47.232+09:00"]
          ["2011-04-18T09:00:00.000+09:00"]
          ["2011-04-18T19:12:47.232+09:00"]]}
  ((post-format-rows (constantly {:rows [[(tc/to-sql-time 1303121567232)]
                                         [(tc/to-sql-date "2011-04-18")] ; joda-time assumes this is UTC time when parsing it
                                         [(tc/to-date 1303121567232)]]})) {:settings {:report-timezone "Asia/Tokyo"}}))
