(ns metabase-enterprise.metabot-v3.tools.find-metric
  (:require [metabase-enterprise.metabot-v3.client :as client]
            [metabase-enterprise.metabot-v3.dummy-tools :as dummy-tools]
            [metabase-enterprise.metabot-v3.tools.interface :as tools.interface]
            [toucan2.core :as t2]))

(defmethod tools.interface/*invoke-tool* :metabot.tool/find-metric
  [_ {:keys [message]} context]
  (let [{:keys [id]} (client/select-metric-request
                      (t2/select [:model/Card :id :name :description]
                                 :type [:= "metric"])
                      message)]
    {:output (or (some-> id dummy-tools/metric-details)
                 "Metric not found.")
     :context context}))
