(ns metabase.pulse.events
  "Handler of the update event of a Dashboard, which keeps its subscriptions in step with its dashcards, its name and
  its Collection. The subscriptions follow the Cards of the dashcards, so Tabs and series do not matter."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.util.events :as u.events]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- dashboard-id-of
  "The id of the Dashboard whose subscriptions the `change` of a Dashboard calls to sync, or nil."
  [change]
  (when (= :update (u.events/operation change))
    (:id (:object change))))

(defn- new-pulse-cards
  "The PulseCards to add so that the `subscriptions` of each Dashboard, rows of
  [[pulse.db/subscriptions-for-dashboards]], show the Cards of its `dashcards`, by Dashboard id, each Pulse taking them
  after its last position, from `max-positions`, by Pulse id."
  [subscriptions dashcards max-positions]
  (for [[dashboard-id rows] (group-by :dashboard-id subscriptions)
        :let  [card-id->dashcard-id (into {} (map (juxt :card_id :id)) (get dashcards dashboard-id))
               cards-to-add         (set/difference (set (keys card-id->dashcard-id)) (set (keep :card-id rows)))
               to-add               (filter (comp cards-to-add key) card-id->dashcard-id)]
        pulse-id                         (distinct (map :pulse-id rows))
        [[card-id dashcard-id] position] (map vector
                                              to-add
                                              (drop (or (some-> (get max-positions pulse-id) inc) 0) (range)))]
    {:pulse_id          pulse-id
     :card_id           card-id
     :dashboard_card_id dashcard-id
     :position          position}))

(defn- sync-subscriptions!
  "Update the names and Collection ids of the Pulses of the Dashboards that the lifecycle `event` updates, and sync their
  PulseCards with the dashcards those Dashboards have, with a number of reads that does not grow with the Dashboards."
  [{:keys [changes]}]
  (when-let [dashboard-ids (not-empty (into [] (comp (keep dashboard-id-of) (distinct)) changes))]
    (when-let [subscriptions (not-empty (pulse.db/subscriptions-for-dashboards dashboard-ids))]
      (let [dashboards    (into {} (map (juxt :id identity))
                                (pulse.db/dashboards-by-id (vec (distinct (map :dashboard-id subscriptions)))))
            subscriptions (filter #(contains? dashboards (:dashboard-id %)) subscriptions)
            dashcards     (when (seq subscriptions)
                            (group-by :dashboard_id
                                      (pulse.db/dashcards-with-cards-for-dashboards (vec (keys dashboards)))))
            pulse-ids     (vec (distinct (map :pulse-id subscriptions)))
            max-positions (when (seq pulse-ids) (pulse.db/max-pulse-card-positions pulse-ids))
            stale         (into []
                                (comp (filter (fn [{:keys [dashboard-id name collection-id]}]
                                                (let [dashboard (get dashboards dashboard-id)]
                                                  (or (not= name (:name dashboard))
                                                      (not= collection-id (:collection_id dashboard))))))
                                      (map :dashboard-id)
                                      (distinct))
                                subscriptions)
            new-cards     (new-pulse-cards subscriptions dashcards max-positions)]
        (when (or (seq stale) (seq new-cards))
          (t2/with-transaction [_conn]
            (binding [api/*current-user-id* nil]
              (models.pulse/update-pulses-for-dashboards!
               (into {}
                     (map (fn [dashboard-id]
                            (let [dashboard (get dashboards dashboard-id)]
                              [dashboard-id {:name          (:name dashboard)
                                             :collection_id (:collection_id dashboard)}])))
                     stale))
              (models.pulse/append-pulse-cards! new-cards))))))))

(events/derive! :event/dashboard-update ::dashboard-subscriptions)

(methodical/defmethod events/publish-event! ::dashboard-subscriptions
  [_topic event]
  (sync-subscriptions! event))
