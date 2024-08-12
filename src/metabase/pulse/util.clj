(ns metabase.pulse.util
  "Utils for pulses."
  (:require
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.query-processor :as qp]
   [metabase.query-processor.dashboard :as qp.dashboard]
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
                                 (qp/userland-query
                                  (assoc query :middleware {:skip-results-metadata?            true
                                                            :process-viz-settings?             true
                                                            :js-int-to-string?                 false
                                                            :add-default-userland-constraints? false})
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

(defn is-card-empty?
  "Check if the card is empty"
  [card]
  (if-let [result (:result card)]
    (or (zero? (-> result :row_count))
        ;; Many aggregations result in [[nil]] if there are no rows to aggregate after filters
        (= [[nil]]
           (-> result :data :rows)))
    ;; Text cards have no result; treat as empty
    true))

(defn execute-dashboard-subscription-card
  "Returns subscription result for a card.

  This function should be executed under pulse's creator permissions."
  [dashcard parameters]
  (try
    (let [{card-id      :card_id
           dashboard-id :dashboard_id} dashcard
          card                         (t2/select-one :model/Card :id card-id)
          multi-cards                  (dashboard-card/dashcard->multi-cards dashcard)
          result-fn                    (fn [card-id]
                                         {:card     (if (= card-id (:id card))
                                                      card
                                                      (t2/select-one :model/Card :id card-id))
                                          :dashcard dashcard
                                          :type     :card
                                          :result   (qp.dashboard/process-query-for-dashcard
                                                     :dashboard-id  dashboard-id
                                                     :card-id       card-id
                                                     :dashcard-id   (u/the-id dashcard)
                                                     :context       :dashboard-subscription
                                                     :export-format :api
                                                     :parameters    parameters
                                                     :constraints   {}
                                                     :middleware    {:process-viz-settings?             true
                                                                     :js-int-to-string?                 false
                                                                     :add-default-userland-constraints? false}
                                                     :make-run      (fn make-run [qp _export-format]
                                                                      (^:once fn* [query info]
                                                                       (qp
                                                                        (qp/userland-query query info)
                                                                        nil))))})
          result                       (result-fn card-id)
          series-results               (map (comp result-fn :id) multi-cards)]
      (when-not (and (get-in dashcard [:visualization_settings :card.hide_empty])
                     (is-card-empty? (assoc card :result (:result result))))
        (update result :dashcard assoc :series-results series-results)))
    (catch Throwable e
      (log/warnf e "Error running query for Card %s" (:card_id dashcard)))))
