(ns metabase-enterprise.metabot-v3.tools.find-metric
  (:require
   [metabase-enterprise.metabot-v3.client :as client]
   [metabase-enterprise.metabot-v3.dummy-tools :as dummy-tools]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(defn find-metric
  "Find a metric described by `message`.

  See [[metabase-enterprise.metabot-v3.dummy-tools/metric-details]] for the output if a metric can be found."
  [{:keys [message]}]
  (lib.metadata.jvm/with-metadata-provider-cache
    (let [{:keys [id]} (client/select-metric-request
                        (->> (t2/select [:model/Card :id :name :description]
                                        :type [:= "metric"]
                                        :archived [:= false])
                             (filter mi/can-read?))
                        message)]
      (if-let [result (when id
                        (dummy-tools/metric-details id))]
        {:structured-output result}
        {:output "Metric not found."}))))
