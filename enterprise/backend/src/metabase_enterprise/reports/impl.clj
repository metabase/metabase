(ns metabase-enterprise.reports.impl
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.reports.models.report-run-card-data]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.middleware.cache.impl :as impl]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn snapshot-cards
  [cards-to-run report-id report-version-id run-id]
  (try
    (doseq [card cards-to-run]
      ;; TODO(edpaget): encrypt
      (impl/do-with-serialization
       (fn [in-fn result-fn]
         (let [capture-rff (fn capture-rff [metadata]
                             (in-fn (assoc metadata
                                           :cache-version 3
                                           :last-ran (t/zoned-date-time)))
                             (fn
                               ([] {:data metadata})
                               ([result]
                                (in-fn (if (map? result)
                                         (->
                                          (m/dissoc-in result [:data :rows])
                                          (m/dissoc-in [:json_query :lib/metadata]))
                                         {}))
                                result)
                               ([result row]
                                (in-fn row)
                                result)))
               make-run (fn [qp _]
                          (fn [query info]
                            (qp (assoc query :info info) capture-rff)))]
           (qp.card/process-query-for-card
            (:id card) :api
            :make-run make-run
            :context :report))
         (t2/insert! :model/ReportRunCardData
                     {:run_id run-id
                      :card_id (:id card)
                      :data (result-fn)}))))

    (t2/update! :model/ReportRun run-id {:status :finished})
    (catch Exception e
      (log/error e "Error running report" {:report-id report-id :version-id report-version-id :run-id run-id})
      (t2/update! :model/ReportRun run-id {:status :errored}))))
