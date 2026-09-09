(ns metabase.pulse.events.dashboard-subscription
  (:require
   [clojure.set :as set]
   [metabase.events.core :as events]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.models.pulse-card :as pulse-card]
   [metabase.util :as u]
   [methodical.core :as m]
   [toucan2.core :as t2]))

(events/derive! ::dashboard-update :metabase/event)
(events/derive! :event/dashboard-update ::dashboard-update)

(m/defmethod events/publish-event! ::dashboard-update
  "Updates the pulses' names and collection IDs, and syncs the PulseCards"
  [_ {dashboard :object}]
  (let [dashboard-id (u/the-id dashboard)
        affected     (pulse.db/pulse-card-pairs-for-dashboard dashboard-id)]
    (when-let [pulse-ids (seq (distinct (map :pulse-id affected)))]
      (let [correct-card-ids     (set (pulse.db/dashboard-card-ids-for-dashboard dashboard-id))
            stale-card-ids       (->> affected
                                      (keep :card-id)
                                      set)
            cards-to-add         (set/difference correct-card-ids stale-card-ids)
            card-id->dashcard-id (when (seq cards-to-add)
                                   (pulse.db/dashcard-ids-by-card dashboard-id cards-to-add))
            positions-for        (fn [pulse-id] (drop (pulse-card/next-position-for pulse-id)
                                                      (range)))
            new-pulse-cards      (for [pulse-id                         pulse-ids
                                       [[card-id dashcard-id] position] (map vector
                                                                             card-id->dashcard-id
                                                                             (positions-for pulse-id))]
                                   {:pulse_id          pulse-id
                                    :card_id           card-id
                                    :dashboard_card_id dashcard-id
                                    :position          position})]
        (t2/with-transaction [_conn]
          (binding [models.pulse/*allow-moving-dashboard-subscriptions* true]
            (pulse.db/update-pulses-for-dashboard! dashboard-id
                                                   ;; TODO we probably don't need this anymore
                                                   ;; pulse.name is no longer used for generating title.
                                                   ;; pulse.collection_id is a thing for the old "Pulse" feature, but it was removed
                                                   {:name (:name dashboard)
                                                    :collection_id (:collection_id dashboard)})
            (pulse-card/bulk-create! new-pulse-cards)))))))
