(ns metabase.dashboards.audit
  "What the audit spec of a Dashboard and of a Dashboard Card needs beyond their columns."
  (:require
   [metabase.dashboards.db :as dashboards.db]
   [metabase.util.events :as u.events]))

(set! *warn-on-reflection* true)

(defn cards-details
  "The details of the rows recorded under Dashboards for the writes of their DashboardCards, `events-by-key`, a map
  from `[dashboard-id topic]` to the events of one Dashboard and topic: the Dashboard, and each DashboardCard with the
  name and the description of its Card, by the same keys, the Dashboards and the Cards loaded together."
  [events-by-key]
  (let [dashcards  (update-vals events-by-key (fn [events] (map #(or (:object %) (:previous-object %)) events)))
        dashboards (if-let [ids (not-empty (into [] (comp (map first) (distinct)) (keys events-by-key)))]
                     (into {} (map (juxt :id identity)) (dashboards.db/dashboards ids))
                     {})
        cards      (if-let [ids (not-empty (into [] (comp (mapcat val) (keep :card_id) (distinct)) dashcards))]
                     (into {}
                           (map (juxt :id #(select-keys % [:name :description])))
                           (dashboards.db/cards-by-ids ids))
                     {})]
    (into {}
          (for [[[dashboard-id :as k] rows] dashcards]
            [k (-> (select-keys (get dashboards dashboard-id) [:description :name :id])
                   (assoc :dashcards (for [{:keys [id card_id]} rows]
                                       (-> (cards card_id)
                                           (assoc :id id)
                                           (assoc :card_id card_id)))))]))))

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
