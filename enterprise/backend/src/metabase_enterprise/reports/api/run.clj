(ns metabase-enterprise.reports.api.run
  "`/api/ee/report/:report-id/version/:report-version-id/run` routes"
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.reports.models.report-run :as reports.m.run]
   [metabase-enterprise.reports.models.report-run-card-data]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.middleware.cache.impl :as impl]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(def ^:private RunResource
  [:map
   [:id pos-int?]
   [:created_at :any]
   [:status reports.m.run/RunStatus]
   [:user [:map
           [:id pos-int?]
           [:first_name :string]
           [:last_name :string]
           [:email :string]]]])

(api.macros/defendpoint :post "/:report-id/version/:report-version-id/run" :- RunResource
  "Create a new run for this report. A run causes all queries for cards embedded in this report to be run
  and saved.

  TODO(edpaget): Parameters?"
  [{:keys [report-id report-version-id]} :- [:map
                                             [:report-id pos-int?]
                                             [:report-version-id pos-int?]]
   _query-params
   _body-params]
  (api/check-404 (t2/exists? :model/ReportVersion :id report-version-id :report_id report-id))

  (let [run-id (t2/insert-returning-pk! :model/ReportRun {:version_id report-version-id
                                                          :status :in-progress
                                                          :user_id api/*current-user-id*})
        cards-to-run (t2/select :model/Card :report_document_version_id report-version-id)]

    ;; TODO(edpaget): async?
    ;; Run each card using the query processor
    (try
      (doseq [card cards-to-run]
        (let [pivot? (= (:display card) :pivot)
              ;; Capture the results using a custom reducing function
              captured-result (atom nil)
              captured-metadata (atom nil)
              rows-buffer (volatile! [])

              ;; Create a custom reducing function that captures results
              capture-rf (fn capture-rf [metadata]
                           (prn "HERE")
                           (prn metadata)
                           (reset! captured-metadata metadata)
                           (fn
                             ([] nil)
                             ([result]
                              ;; Store the final result
                              (reset! captured-result result)
                              result)
                             ([acc row]
                              ;; Accumulate rows
                              (vswap! rows-buffer conj row)
                              (if (map? acc)
                                (update-in acc [:data :rows] (fnil conj []) row)
                                acc))))]

          ;; Run the query with our capturing reducing function
          ;;
          (prn (qp.card/process-query-for-card
                (:id card) :api
                :context :report
                :qp qp.pivot/run-pivot-query))
          (if pivot?
            (qp.card/process-query-for-card
             (:id card) :api
             :context :report
             :qp qp.pivot/run-pivot-query
             :rff capture-rf)
            (qp.card/process-query-for-card
             (:id card) :api
             :context :report
             :rff capture-rf))

          (prn rows-buffer)
          ;; Save to ReportRunCardData
          ;; TODO(edpaget): encrypt
          (t2/insert! :model/ReportRunCardData
                      {:run_id run-id
                       :card_id (:id card)
                       :data (impl/do-with-serialization
                              (fn [in-fn result-fn]
                                  ;; Add metadata with cache version
                                (in-fn (assoc @captured-metadata
                                              :cache-version 3
                                              :last-ran (t/zoned-date-time)))
                                  ;; Add all rows
                                (doseq [row @rows-buffer]
                                  (prn row)
                                  (in-fn row))
                                  ;; Add final metadata
                                (when (map? @captured-result)
                                  (in-fn (m/dissoc-in @captured-result [:data :rows])))
                                  ;; Get the serialized bytes
                                (result-fn)))})))

      (t2/update! :model/ReportRun run-id {:status :finished})
      (catch Exception e
        (log/error e "Error running report" {:report-id report-id :version-id report-version-id :run-id run-id})
        (t2/update! :model/ReportRun run-id {:status :errored})))

    (first (t2/hydrate [(t2/select-one :model/ReportRun :id run-id)] :user))))

(api.macros/defendpoint :get "/:report-id/version/:report-version-id/run" :- [:map [:data [:sequential RunResource]]]
  "Get all runs for a report and version"
  [{:keys [report-id report-version-id]} :- [:map
                                             [:report-id pos-int?]
                                             [:report-version-id pos-int?]]
   _query-params
   _body-params]
  (api/check-404 (t2/exists? :model/ReportVersion :id report-version-id :report_id report-id))

  {:data (t2/hydrate (t2/select :model/ReportRun :version_id report-version-id {:order-by [[:created_at :desc]]}) :user)})

(api.macros/defendpoint :get "/:report-id/version/:report-version-id/run/latest" :- RunResource
  "Get the most recent run for a report version"
  [{:keys [report-id report-version-id]} :- [:map
                                             [:report-id pos-int?]
                                             [:report-version-id pos-int?]]
   _query-params
   _body-params]
  (api/check-404 (t2/exists? :model/ReportVersion :id report-version-id :report_id report-id))

  (let [latest-run (t2/select-one :model/ReportRun
                                  :version_id report-version-id
                                  {:order-by [[:created_at :desc]]})]
    (api/check-404 latest-run)
    (first (t2/hydrate [latest-run] :user))))

(api.macros/defendpoint :get "/:report-id/version/:report-version-id/run/:run-id" :- RunResource
  "Get information about a given run"
  [{:keys [report-id report-version-id run-id]} :- [:map
                                                    [:report-id pos-int?]
                                                    [:report-version-id pos-int?]
                                                    [:run-id pos-int?]]
   _query-params
   _body-params]
  (api/check-404 (t2/exists? :model/ReportVersion :id report-version-id :report_id report-id))
  (api/check-404 (t2/exists? :model/ReportRun :id run-id :version_id report-version-id))

  (first (t2/hydrate [(t2/select-one :model/ReportRun :id run-id)] :user)))

(defn- deserialize-card-data
  "Deserialize the results stored in ReportRunCardData into a response format"
  [^bytes serialized-bytes]
  (when serialized-bytes
    (let [metadata-atom (atom nil)
          rows (atom [])
          final-metadata (atom nil)]
      (impl/with-reducible-deserialized-results [[metadata reducible-rows] (ByteArrayInputStream. serialized-bytes)]
        (when metadata
          (reset! metadata-atom (dissoc metadata :cache-version :last-ran))
          (when reducible-rows
            (reduce (fn [acc row]
                      (if (map? row)
                        (reset! final-metadata row)
                        (swap! rows conj row))
                      acc)
                    nil
                    reducible-rows))))
      ;; Merge initial and final metadata, add rows
      (-> (merge @metadata-atom @final-metadata)
          (assoc-in [:data :rows] @rows)))))

(api.macros/defendpoint :get "/:report-id/version/:report-version-id/run/:run-id/card/:card-id"
  "Get the saved results for a specific card in a specific run."
  [{:keys [report-id report-version-id run-id card-id]} :- [:map
                                                            [:report-id pos-int?]
                                                            [:report-version-id pos-int?]
                                                            [:run-id pos-int?]
                                                            [:card-id pos-int?]]
   _query-params
   _body-params]
  ;; Verify the report version exists
  (api/check-404 (t2/exists? :model/ReportVersion :id report-version-id :report_id report-id))

  ;; Verify the run exists and belongs to this version
  (api/check-404 (t2/exists? :model/ReportRun :id run-id :version_id report-version-id))

  ;; Verify the card exists and belongs to this version
  (api/check-404 (t2/exists? :model/Card :id card-id :report_document_version_id report-version-id))

  ;; Get the card data for this run
  (let [card-data (t2/select-one :model/ReportRunCardData
                                 :run_id run-id
                                 :card_id card-id)]
    (api/check-404 card-data)

    ;; Deserialize and return the results as regular JSON
    (if-let [serialized-bytes (:data card-data)]
      (deserialize-card-data serialized-bytes)
      (throw (ex-info "No data found for card"
                      {:report-id report-id
                       :version-id report-version-id
                       :run-id run-id
                       :card-id card-id})))))

(api.macros/defendpoint :get "/:report-id/version/:report-version-id/run/latest/card/:card-id"
  "Get the saved results for a specific card from the most recent run."
  [{:keys [report-id report-version-id card-id]} :- [:map
                                                     [:report-id pos-int?]
                                                     [:report-version-id pos-int?]
                                                     [:card-id pos-int?]]
   _query-params
   _body-params]
  ;; Verify the report version exists
  (api/check-404 (t2/exists? :model/ReportVersion :id report-version-id :report_id report-id))

  ;; Verify the card exists and belongs to this version
  (api/check-404 (t2/exists? :model/Card :id card-id :report_document_version_id report-version-id))

  ;; Get the latest run for this version
  (let [latest-run (t2/select-one :model/ReportRun
                                  :version_id report-version-id
                                  {:order-by [[:created_at :desc]]})]
    (api/check-404 latest-run)

    ;; Get the card data for the latest run
    (let [card-data (t2/select-one :model/ReportRunCardData
                                   :run_id (:id latest-run)
                                   :card_id card-id)]
      (api/check-404 card-data)

      ;; Deserialize and return the results as regular JSON
      (if-let [serialized-bytes (:data card-data)]
        (deserialize-card-data serialized-bytes)
        (throw (ex-info "No data found for card"
                        {:report-id report-id
                         :version-id report-version-id
                         :run-id (:id latest-run)
                         :card-id card-id}))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/report/:report-id/version/:report-version-id/run` routes."
  (api.macros/ns-handler *ns* +auth))
