(ns metabase.notification.execute
  (:require
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.server.middleware.session :as mw.session]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

;; TODO - this should be done async
;; TODO - this and `execute-multi-card` should be made more efficient: eg. we query for the card several times
(defn execute-card
  "Execute the query for a single Card."
  [creator-id card-id]
  {:pre [(integer? creator-id)
         (integer? card-id)]}
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
                                (cond-> {:executed-by creator-id
                                         :context     :pulse
                                         :card-id     card-id}
                                  (= card-type :model)
                                  (assoc :metadata/model-metadata metadata))))))
            result        (if creator-id
                            (mw.session/with-current-user creator-id
                              (process-query))
                            (process-query))]
        {:card   card
         :result result}))
    (catch Throwable e
      (log/warnf e "Error running query for Card %s" card-id))))
