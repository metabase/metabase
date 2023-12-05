(ns metabase.pulse.util
  "Utils for pulses."
  (:require
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.server.middleware.session :as mw.session]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

;; TODO - this should be done async
(defn execute-card
  "Execute the query for a single Card. `options` are passed along to the Query Processor."
  [{pulse-creator-id :creator_id} card-or-id & {:as options}]
  ;; The Card must either be executed in the context of a User
  {:pre [(integer? pulse-creator-id)]}
  (let [card-id (u/the-id card-or-id)]
    (try
      (when-let [{query :dataset_query
                  :keys [dataset result_metadata]
                  :as card} (t2/select-one :model/Card :id card-id, :archived false)]
        (let [query         (assoc query :async? false)
              process-query (fn []
                              (binding [qp.perms/*card-id* card-id]
                                (qp/process-query-and-save-with-max-results-constraints!
                                 (assoc query :middleware {:process-viz-settings? true
                                                           :js-int-to-string?     false})
                                 (merge (cond->
                                          {:executed-by               pulse-creator-id
                                           :context                   :pulse
                                           :card-id                   card-id}
                                          dataset
                                          (assoc :metadata/dataset-metadata result_metadata))
                                        options))))
              result        (if pulse-creator-id
                              (mw.session/with-current-user pulse-creator-id
                                (process-query))
                              (process-query))]
          {:card   card
           :result result}))
      (catch Throwable e
        (log/warn e (trs "Error running query for Card {0}" card-id))))))

(defn execute-multi-card
  "Multi series card is composed of multiple cards, all of which need to be executed.

  This is as opposed to combo cards and cards with visualizations with multiple series,
  which are viz settings."
  [card-or-id dashcard-or-id]
  (let [card-id      (u/the-id card-or-id)
        dashcard-id  (u/the-id dashcard-or-id)
        card         (t2/select-one :model/Card :id card-id, :archived false)
        dashcard     (t2/select-one :model/DashboardCard :id dashcard-id)
        multi-cards  (dashboard-card/dashcard->multi-cards dashcard)]
    (for [multi-card multi-cards]
      (execute-card {:creator_id (:creator_id card)} (:id multi-card)))))
