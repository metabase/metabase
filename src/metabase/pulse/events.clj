(ns metabase.pulse.events
  "Handlers of the lifecycle events that keep the subscriptions of a Dashboard in step with its dashcards, its name and
  its Collection, once per Dashboard for the writes of one batch. The subscriptions follow the Cards of the dashcards,
  so Tabs and series do not matter."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.models.pulse-card :as pulse-card]
   [metabase.util.events :as u.events]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- owner
  "The id of the Dashboard whose subscriptions the `event` calls to sync, or nil."
  [{:keys [model operation object previous-object] :as event}]
  (case model
    :model/Dashboard     (when (and (= :update operation)
                                    (u.events/changed-any? event #{:name :collection_id}))
                           (:id object))
    :model/DashboardCard (when (or (#{:create :delete} operation)
                                   (u.events/changed-any? event #{:card_id :dashboard_id}))
                           (:dashboard_id (or object previous-object)))
    nil))

(defn- sync-subscriptions!
  "Update the names and Collection ids of the Pulses of the Dashboard `dashboard-id`, and sync their PulseCards with
  the dashcards the Dashboard has."
  [dashboard-id _events _all-events]
  (let [affected (pulse.db/pulse-card-pairs-for-dashboard dashboard-id)]
    (when-let [pulse-ids (seq (distinct (map :pulse-id affected)))]
      (when-let [dashboard (pulse.db/dashboard dashboard-id)]
        (let [correct-card-ids     (set (pulse.db/dashboard-card-ids-for-dashboard dashboard-id))
              stale-card-ids       (set (keep :card-id affected))
              cards-to-add         (set/difference correct-card-ids stale-card-ids)
              card-id->dashcard-id (when (seq cards-to-add)
                                     (pulse.db/dashcard-ids-by-card dashboard-id cards-to-add))
              positions-for        (fn [pulse-id] (drop (pulse-card/next-position-for pulse-id) (range)))
              new-pulse-cards      (for [pulse-id                         pulse-ids
                                         [[card-id dashcard-id] position] (map vector
                                                                               card-id->dashcard-id
                                                                               (positions-for pulse-id))]
                                     {:pulse_id          pulse-id
                                      :card_id           card-id
                                      :dashboard_card_id dashcard-id
                                      :position          position})]
          (t2/with-transaction [_conn]
            (binding [models.pulse/*allow-moving-dashboard-subscriptions* true
                      api/*current-user-id*                               nil]
              (pulse.db/update-pulses-for-dashboard! dashboard-id {:name          (:name dashboard)
                                                                   :collection_id (:collection_id dashboard)})
              (pulse-card/bulk-create! new-pulse-cards))))))))

(events/register-owned-consumer! ::dashboard-subscriptions owner sync-subscriptions!)
