(ns metabase.pulse.util
  "Utils for pulses."
  (:require
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.server.middleware.session :as mw.session]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

;; TODO - this should be done async
;; TODO - this and `execute-multi-card` should be made more efficient: eg. we query for the card several times
(defn execute-card
  "Execute the query for a single Card. `options` are passed along to the Query Processor."
  [{pulse-creator-id :creator_id} card-or-id & {:as options}]
  ;; The Card must either be executed in the context of a User
  {:pre [(integer? pulse-creator-id)]}
  (let [card-id (u/the-id card-or-id)]
    (try
      (when-let [{query     :dataset_query
                  metadata  :result_metadata
                  card-type :type
                  :as       card} (t2/select-one :model/Card :id card-id, :archived false)]
        (let [query         (assoc query :async? false)
              process-query (fn []
                              (binding [qp.perms/*card-id* card-id]
                                (qp/process-query
                                 (qp/userland-query-with-default-constraints
                                  (assoc query :middleware {:skip-results-metadata? true
                                                            :process-viz-settings?  true
                                                            :js-int-to-string?      false})
                                  (merge (cond-> {:executed-by pulse-creator-id
                                                  :context     :pulse
                                                  :card-id     card-id}
                                           (= card-type :model)
                                           (assoc :metadata/model-metadata metadata))
                                         options)))))
              result        (if pulse-creator-id
                              (mw.session/with-current-user pulse-creator-id
                                (process-query))
                              (process-query))]
          {:card   card
           :result result}))
      (catch Throwable e
        (log/warnf e "Error running query for Card %s" card-id)))))

(defn execute-multi-card
  "Multi series card is composed of multiple cards, all of which need to be executed.

  This is as opposed to combo cards and cards with visualizations with multiple series,
  which are viz settings."
  [card-or-id dashcard-or-id]
  (if dashcard-or-id
    (let [card-id     (u/the-id card-or-id)
          card        (t2/select-one :model/Card :id card-id, :archived false)
          ;; NOTE/TODO - dashcard-or-id is nil with multiple time series
          dashcard-id (u/the-id dashcard-or-id)
          dashcard    (t2/select-one :model/DashboardCard :id dashcard-id)
          multi-cards (dashboard-card/dashcard->multi-cards dashcard)]
      (for [multi-card (if (seq multi-cards)
                         multi-cards
                         [card])]
        (execute-card {:creator_id (:creator_id card)} (:id multi-card))))
    (let [card-id (u/the-id card-or-id)
          ;; NOTE/TODO - dashcard-or-id is nil with multiple time series
          card    (t2/select-one :model/Card :id card-id, :archived false)]
      [(execute-card {:creator_id (:creator_id card)} (:id card))])))
