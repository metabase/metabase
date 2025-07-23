(ns metabase-enterprise.reports.api.run
  "`/api/ee/report/:report-id/version/:report-version-id/run` routes"
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.reports.impl :as reports.impl]
   [metabase-enterprise.reports.models.report-run :as reports.m.run]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.util :as u]
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

    (reports.impl/snapshot-cards cards-to-run report-id report-version-id run-id)

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
                                  {:order-by [[:created_at :desc] [:id :desc]]})]
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

(defn- results-rff
  [rff]
  (fn results-rff
    [metadata]
    (let [rf (rff (dissoc metadata :last-ran :cache-version))]
      (fn
        ([] (rf))
        ([result]
         (rf result))
        ([acc row]
         (if (map? row)
           row
           (rf acc row)))))))

(defn- deserialize-card-data
  "Deserialize the results stored in ReportRunCardData into a response format"
  [^bytes serialized-bytes rff]
  (when serialized-bytes
    (cache.impl/with-reducible-deserialized-results [[metadata reducible-rows] (ByteArrayInputStream. serialized-bytes)]
      (when metadata
        (qp.pipeline/*reduce* (results-rff rff) metadata reducible-rows)))))

(defn- stream-card-data
  [card-id card-data]
  (when-let [serialized-bytes (:data card-data)]
    (let [make-run (fn [_qp export-format]
                     (fn [_query info]
                       (qp.streaming/streaming-response [rff export-format (u/slugify (:card-name info))]
                         (deserialize-card-data serialized-bytes rff))))]
      (qp.card/process-query-for-card
       card-id :api
       :make-run make-run
       :context :report))))

(api.macros/defendpoint :get "/:report-id/version/:report-version-id/run/:run-id/card/:card-id"
  "Get the saved results for a specific card in a specific run."
  [{:keys [report-id report-version-id run-id card-id]} :- [:map
                                                            [:report-id pos-int?]
                                                            [:report-version-id pos-int?]
                                                            [:run-id pos-int?]
                                                            [:card-id pos-int?]]
   _query-params
   _body-params]

  ;; TODO: make this happen via join
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
    (api/check-404 (:data card-data))

    ;; Deserialize and return the results as regular JSON
    (stream-card-data card-id card-data)))

(api.macros/defendpoint :get "/:report-id/version/:report-version-id/run/latest/card/:card-id"
  "Get the saved results for a specific card from the most recent run."
  [{:keys [report-id report-version-id card-id]} :- [:map
                                                     [:report-id pos-int?]
                                                     [:report-version-id pos-int?]
                                                     [:card-id pos-int?]]
   _query-params
   _body-params]
  ;; TODO: make this happen via join
  ;; Verify the report version exists
  (api/check-404 (t2/exists? :model/ReportVersion :id report-version-id :report_id report-id))

  ;; Verify the card exists and belongs to this version
  (api/check-404 (t2/exists? :model/Card :id card-id :report_document_version_id report-version-id))

  ;; Get the latest run for this version
  (let [latest-run (t2/select-one :model/ReportRun
                                  :version_id report-version-id
                                  {:order-by [[:created_at :desc] [:id :desc]]})]
    (api/check-404 latest-run)

    ;; Get the card data for the latest run
    (let [card-data (t2/select-one :model/ReportRunCardData
                                   :run_id (:id latest-run)
                                   :card_id card-id)]
      (api/check-404 (:data card-data))

      ;; Deserialize and return the results as regular JSON
      (stream-card-data card-id card-data))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/report/:report-id/version/:report-version-id/run` routes."
  (api.macros/ns-handler *ns* +auth))
