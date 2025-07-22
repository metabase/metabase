(ns metabase-enterprise.reports.api.run
  "`/api/ee/report/:report-id/version/:report-version-id/run` routes"
  (:require
   [metabase-enterprise.reports.models.report-run :as reports.m.run]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.query-processor.card :as qp.card]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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
                                                          :status "in-progress"
                                                          :user_id api/*current-user-id*})
        cards-to-run (t2/select :model/Card :report_document_version_id report-version-id)]

    ;; TODO(edpaget): async?
    ;; Run each card using the query processor
    (try
      (doseq [card cards-to-run]
        ;; Use the query processor to run each card
        (qp.card/process-query-for-card
         (:id card) :api
         :context :report))
      ;; Update status to completed when all cards have been processed
      (t2/update! :model/ReportRun run-id {:status "finished"})
      (catch Exception e
        (log/error e "Error running report" {:report-id report-id :version-id report-version-id :run-id run-id})
        (t2/update! :model/ReportRun run-id {:status "failed"})))

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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/report/:report-id/version/:report-version-id/run` routes."
  (api.macros/ns-handler *ns* +auth))
