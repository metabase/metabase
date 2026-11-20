(ns metabase.dashboards.audit
  "What the audit spec of a Dashboard and of a Dashboard Card needs beyond their columns."
  (:require
   [metabase.dashboards.db :as dashboards.db]
   [metabase.util.events :as u.events]))

(set! *warn-on-reflection* true)

(defn cards-details
  "The details of the row recorded under the Dashboard `dashboard-id` for the `events` of the writes of its
  DashboardCards: the Dashboard, and each DashboardCard with the name and the description of its Card."
  [dashboard-id events]
  (let [dashboard (dashboards.db/dashboard dashboard-id)
        dashcards (map #(or (:object %) (:previous-object %)) events)
        cards     (into {}
                        (map (juxt :id #(select-keys % [:name :description])))
                        (dashboards.db/cards-by-ids (vec (keep :card_id dashcards))))]
    (-> (select-keys dashboard [:description :name :id])
        (assoc :dashcards (for [{:keys [id card_id]} dashcards]
                            (-> (cards card_id)
                                (assoc :id id)
                                (assoc :card_id card_id)))))))

(defn public-link-created?
  "Whether the `event` of a write of a Dashboard gives it a public link."
  [{:keys [object] :as event}]
  (and (u.events/changed? event :public_uuid)
       (some? (:public_uuid object))))

(defn public-link-deleted?
  "Whether the `event` of a write of a Dashboard takes its public link away."
  [{:keys [object] :as event}]
  (and (u.events/changed? event :public_uuid)
       (nil? (:public_uuid object))))
