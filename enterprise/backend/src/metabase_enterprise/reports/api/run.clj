(ns metabase-enterprise.reports.api.run
  "`/api/ee/report/:report-id/:report-version-id/run` routes"
  (:require
   [metabase-enterprise.reports.models.report-run :as reports.m.run]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [toucan2.core :as t2]))

(def ^:private RunResource
  [:map
   [:id pos-int?
    :created_at :any
    :status reports.m.run/RunStatus
    :user [:map
           [:id pos-int?]
           [:first_name :string]
           [:last_name :string]
           [:email :string]]]])

(api.macros/defendpoint :post "/:report-id/:report-version-id/run" :- RunResource
  "Create a new run for this report. A run causes all queries for cards embedded in this report to be run
  and saved.

  TODO(edpaget): Parameters?"
  [{:keys [report-id report-version-id]} :- [:map
                                             [:report-id pos-int?]
                                             [:report-version-id pos-int?]]
   _query-params
   _body-params]
  (api/check-404 (t2/exists? :model/ReportVersion :id report-version-id :report_id report-id))

  (let [run-id (t2/insert-returning-pk! :model/ReportRun {:version_id report-version-id :status :in-progress})
        cards-to-run (t2/select :model/Card :report_version_id report-version-id)]))

(api.macros/defendpoint :get "/:report-id/:report-version-id/run" :- [:map [:data RunResource]]
  "Get all runs for a report and version"
  [{:keys [report-id report-version-id]} :- [:map
                                             [:report-id pos-int?]
                                             [:report-version-id pos-int?]]
   _query-params
   _body-params])

(api.macros/defendpoint :get "/:report-id/:report-version-id/run/:run-id" :- RunResource
  "Get information about a given run"
  [{:keys [report-id report-version-id run-id]} :- [:map
                                                    [:report-id pos-int?]
                                                    [:report-version-id pos-int?]]
   _query-params
   _body-params])
