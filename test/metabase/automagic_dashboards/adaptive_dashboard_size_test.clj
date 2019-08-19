(ns metabase.automagic-dashboards.adaptive-dashboard-size
  (:require [expectations :refer :all]
            [metabase.automagic-dashboards.adaptive-dashboard-size :as adaptive-size]
            [metabase.models.database :refer [Database]]
            [metabase.test.data :as data]
            [toucan.db :as db]))

(def ^:private dummy-dashboard
  (delay {:root   {:database (data/id)}
          :groups {"Summary" {:title "Summary"}}}))

(expect
  #'adaptive-size/max-cards
  (adaptive-size/max-cards-for-dashboard @dummy-dashboard))

(expect
  :summary
  (with-redefs [adaptive-size/long-running-90th-percentile-threshold 0]
    (adaptive-size/max-cards-for-dashboard @dummy-dashboard)))

(expect
  #'adaptive-size/max-cards-if-no-summary
  (with-redefs [adaptive-size/long-running-90th-percentile-threshold 0]
    (adaptive-size/max-cards-for-dashboard (dissoc @dummy-dashboard :groups))))

(expect
  :summary
  (do
    (db/update! Database (data/id) {:auto_run_queries false})
    (let [result (adaptive-size/max-cards-for-dashboard @dummy-dashboard)]
      (db/update! Database (data/id) {:auto_run_queries false})
      result)))
