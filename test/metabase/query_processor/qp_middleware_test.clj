(ns metabase.query_processor.qp-middleware-test
  (:require [clj-time.coerce :as tc]
            [expectations :refer :all]
            [metabase.driver :as driver]
            [metabase.models.setting :as setting]
            [metabase.query-processor.middleware
             [add-row-count-and-status :as add-row-count-and-status]
             [add-settings :as add-settings]
             [catch-exceptions :as catch-exceptions]
             [format-rows :as format-rows]]))

(defrecord ^:private TestDriver []
  clojure.lang.Named
  (getName [_] "TestDriver"))

(extend TestDriver
  driver/IDriver
  {:features (constantly #{:set-timezone})})


;; catch-exceptions

(expect
  {}
  ((catch-exceptions/catch-exceptions identity) {}))

(expect
  {:status        :failed
   :class         java.lang.Exception
   :error         "Something went wrong"
   :stacktrace    true
   :query          {}
   :expanded-query nil}
  (-> ((catch-exceptions/catch-exceptions (fn [_] (throw (Exception. "Something went wrong")))) {})
      (update :stacktrace boolean)))


;; add-settings/add-settings

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


;; add-row-count-and-status

(expect
  {:row_count 5
   :status    :completed
   :data      {:rows           [[1] [1] [1] [1] [1]]
               :rows_truncated 5}}
  ;; NOTE: the default behavior is to treat the query as :rows type aggregation and use :max-results-bare-rows
  ((add-row-count-and-status/add-row-count-and-status (constantly {:rows [[1] [1] [1] [1] [1]]}))
    {:constraints {:max-results           10
                   :max-results-bare-rows 5}}))

(expect
  {:row_count      5
   :status         :completed
   :data           {:rows [[1] [1] [1] [1] [1]]}}
  ;; when we aren't a :rows query the then we use :max-results for our limit
  ((add-row-count-and-status/add-row-count-and-status (constantly {:rows [[1] [1] [1] [1] [1]]}))
    {:query       {:aggregation {:aggregation-type :count}}
     :constraints {:max-results           10
                   :max-results-bare-rows 5}}))


;; format-rows/format-rows

(expect
  {:rows [["2011-04-18T10:12:47.232Z"]
          ["2011-04-18T00:00:00.000Z"]
          ["2011-04-18T10:12:47.232Z"]]}
  ((format-rows/format-rows (constantly {:rows [[(tc/to-sql-time 1303121567232)]
                                         [(tc/to-sql-date "2011-04-18")] ; joda-time assumes this is UTC time when parsing it
                                         [(tc/to-date 1303121567232)]]})) {:settings {}}))

(expect
  {:rows [["2011-04-18T19:12:47.232+09:00"]
          ["2011-04-18T09:00:00.000+09:00"]
          ["2011-04-18T19:12:47.232+09:00"]]}
  ((format-rows/format-rows (constantly {:rows [[(tc/to-sql-time 1303121567232)]
                                         [(tc/to-sql-date "2011-04-18")] ; joda-time assumes this is UTC time when parsing it
                                         [(tc/to-date 1303121567232)]]})) {:settings {:report-timezone "Asia/Tokyo"}}))
