(ns metabase-enterprise.metabot-v3.tools.find-metric
  (:require
   [metabase-enterprise.metabot-v3.client :as client]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.dummy-tools :as dummy-tools]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(defn find-metric
  "Find a metric described by `message`.

  See [[metabase-enterprise.metabot-v3.dummy-tools/metric-details]] for the output if a metric can be found."
  [{:keys [message metabot-id]}]
  (lib.metadata.jvm/with-metadata-provider-cache
    (let [metabot (t2/select-one :model/Metabot :entity_id
                                 (get-in metabot-v3.config/metabot-config [metabot-id :entity-id] metabot-id))
          base-conditions [:and
                           [:= :type "metric"]
                           [:= :archived false]]
          conditions (if (:use_verified_content metabot)
                       [:and
                        base-conditions
                        [:exists {:select [1]
                                  :from [:moderation_review]
                                  :where [:and
                                          [:= :moderation_review.moderated_item_id :report_card.id]
                                          [:= :moderation_review.moderated_item_type "card"]
                                          [:= :moderation_review.status "verified"]]}]]
                       base-conditions)
          {:keys [id]} (client/select-metric-request
                        (->> (t2/select [:model/Card :id :name :description]
                                        {:where conditions})
                             (filter mi/can-read?))
                        message)]
      (if-let [result (when id
                        (dummy-tools/metric-details id))]
        {:structured-output result}
        {:output "Metric not found."}))))
