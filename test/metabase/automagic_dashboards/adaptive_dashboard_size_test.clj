(ns metabase.automagic-dashboards.adaptive-dashboard-size-test
  (:require [expectations :refer :all]
            [metabase.automagic-dashboards.adaptive-dashboard-size :as adaptive-size]
            [metabase.models
             [database :refer [Database]]
             [query-execution :refer [QueryExecution]]]
            [toucan.util.test :as tt]))

(defmacro ^:private with-dummy-dashboard-and-execution-envionment
  [dashboard options & body]
  (let [{:keys [running_time auto_run_queries]} (merge {:auto_run_queries true
                                                        :running_time     100}
                                                       options)]
    `(tt/with-temp* [Database       [{db-id# :id} {:auto_run_queries ~auto_run_queries}]
                     QueryExecution [{} {:running_time ~running_time
                                         :database_id  db-id#
                                         :context      :ad-hoc
                                         :hash         (hash nil)
                                         :started_at   #inst "2019"
                                         :result_rows  100
                                         :native       false}]]
       (let [~dashboard {:root   {:database db-id#}
                         :groups {"Summary" {:title "Summary"}}}]
         ~@body))))

(expect
  (var-get #'adaptive-size/max-cards)
  (with-dummy-dashboard-and-execution-envionment dashboard {}
    (adaptive-size/max-cards-for-dashboard dashboard)))

(expect
  :summary
  (with-dummy-dashboard-and-execution-envionment dashboard
    {:running_time (* (var-get #'adaptive-size/long-running-90th-percentile-threshold) 2)}
    (adaptive-size/max-cards-for-dashboard dashboard)))

(expect
  (var-get #'adaptive-size/max-cards-if-no-summary)
  (with-dummy-dashboard-and-execution-envionment dashboard
    {:running_time (* (var-get #'adaptive-size/long-running-90th-percentile-threshold) 2)}
    (adaptive-size/max-cards-for-dashboard (dissoc dashboard :groups))))

(expect
  :summary
  (with-dummy-dashboard-and-execution-envionment dashboard
    {:auto_run_queries false}
    (adaptive-size/max-cards-for-dashboard dashboard)))
