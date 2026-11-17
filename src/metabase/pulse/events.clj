(ns metabase.pulse.events
  "Handlers of the lifecycle events that keep the subscriptions of a Dashboard in step with its dashcards, its name and
  its Collection, once per Dashboard for the writes of one batch. The subscriptions follow the Cards of the dashcards,
  so Tabs and series do not matter."
  (:require
   [clojure.set :as set]
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
            (binding [models.pulse/*allow-moving-dashboard-subscriptions* true]
              (pulse.db/update-pulses-for-dashboard! dashboard-id {:name          (:name dashboard)
                                                                   :collection_id (:collection_id dashboard)})
              (pulse-card/bulk-create! new-pulse-cards))))))))

(events/register-owned-consumer! ::dashboard-subscriptions owner sync-subscriptions!)

(defn- pulse-owner
  "The id of the Pulse that the `event` of a write of it, of its cards, its channels or their recipients is about."
  [{:keys [model object previous-object]}]
  (let [row (or object previous-object)]
    (case model
      :model/Pulse                 (:id row)
      (:model/PulseCard
       :model/PulseChannel)        (:pulse_id row)
      :model/PulseChannelRecipient (some-> (:pulse_channel_id row) pulse.db/pulse-id-of-channel)
      nil)))

(defn- record-pulse!
  "Publish the creation or the update of the Pulse `pulse-id`, as the Alert or the Subscription it is, once for the
  `events` of a batch, as the user who wrote it."
  [pulse-id events _all-events]
  (when-let [user-id (some :user-id events)]
    (let [pulse-event? #(= :model/Pulse (:model %))
          created?     (some #(and (pulse-event? %) (= :create (:operation %))) events)
          deleted?     (some #(and (pulse-event? %) (= :delete (:operation %))) events)]
      (when-not deleted?
        (if-let [alert (models.pulse/retrieve-alert pulse-id)]
          (when-not created?
            (events/publish-event! :event/alert-update {:object alert :user-id user-id}))
          (when-let [pulse (models.pulse/retrieve-pulse pulse-id)]
            (if created?
              (do (events/publish-event! :event/subscription-create {:object pulse :user-id user-id})
                  (events/publish-event! :event/pulse-create {:object pulse :user-id user-id}))
              (events/publish-event! :event/subscription-update {:object pulse :user-id user-id}))))))))

(events/register-owned-consumer! ::pulse-records pulse-owner record-pulse!)
