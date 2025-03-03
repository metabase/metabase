(ns metabase.pulse.dashboard-subscription
  (:require
   [clojure.set :as set]
   [metabase.db.query :as mdb.query]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.models.pulse-card :as pulse-card]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;; TODO -- should this be done on `:event/dashboard-update` ??
(defn update-dashboard-subscription-pulses!
  "Updates the pulses' names and collection IDs, and syncs the PulseCards"
  [dashboard]
  (let [dashboard-id (u/the-id dashboard)
        affected     (mdb.query/query
                      {:select-distinct [[:p.id :pulse-id] [:pc.card_id :card-id]]
                       :from            [[:pulse :p]]
                       :join            [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
                       :where           [:= :p.dashboard_id dashboard-id]})]
    (when-let [pulse-ids (seq (distinct (map :pulse-id affected)))]
      (let [correct-card-ids     (->> (mdb.query/query
                                       {:select-distinct [:dc.card_id]
                                        :from            [[:report_dashboardcard :dc]]
                                        :where           [:and
                                                          [:= :dc.dashboard_id dashboard-id]
                                                          [:not= :dc.card_id nil]]})
                                      (map :card_id)
                                      set)
            stale-card-ids       (->> affected
                                      (keep :card-id)
                                      set)
            cards-to-add         (set/difference correct-card-ids stale-card-ids)
            card-id->dashcard-id (when (seq cards-to-add)
                                   (t2/select-fn->pk :card_id :model/DashboardCard :dashboard_id dashboard-id
                                                     :card_id [:in cards-to-add]))
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
            (pulse-card/bulk-create! new-pulse-cards)))))))
