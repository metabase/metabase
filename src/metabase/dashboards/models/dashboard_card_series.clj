(ns metabase.dashboards.models.dashboard-card-series
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.dependencies.core :as dependencies]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.models.card :as card]
   [metabase.revisions.core :as revisions]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------ Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/DashboardCardSeries [_model] :dashboardcard_series)

(doto :model/DashboardCardSeries
  (derive :metabase/model)
  (derive :hook/events))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-update :model/DashboardCardSeries
  [series]
  (let [changes (t2/changes series)]
    (when (contains? changes :dashboardcard_id)
      (throw (ex-info (tru "You cannot move a series to another dashboard card.") {:status-code 400})))
    series))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-dashboard-card-series! :- :nil
  "Insert the DashboardCardSeries `rows`."
  [rows :- [:sequential ::dashboards.schema/dashboard-card-series.create]]
  (dashboards.db/insert-dashcard-series! rows)
  nil)

(mu/defn delete-dashboard-card-series-for-dashcards! :- :nil
  "Delete every DashboardCardSeries of the DashboardCards with `dashcard-ids`."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (dashboards.db/delete-series-for-dashcards! dashcard-ids)
  nil)

(mu/defn delete-dashboard-card-series! :- :nil
  "Delete the DashboardCardSeries with `series-ids`."
  [series-ids :- [:sequential ms/PositiveInt]]
  (dashboards.db/delete-dashcard-series! series-ids)
  nil)

(defmethod card/delete-followers! :model/DashboardCardSeries
  [_model ids]
  (delete-dashboard-card-series! ids))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/DashboardCardSeries
  [_model]
  {:create :event/dashboard-card-series-create
   :update :event/dashboard-card-series-update
   :delete :event/dashboard-card-series-delete})

(defmethod app-db-copy/spec :model/DashboardCardSeries [_model]
  {:skip? false})

(defmethod serialization/spec :model/DashboardCardSeries [_]
  {:schema    ::dashboards.schema/external-dashboard-card-series
   :identity  [:dashboardcard_id :position]
   :copy      [:position]
   :parent    {:model :model/DashboardCard :key :dashboardcard_id :order :position}
   :transform {:dashboardcard_id serialization/import-only-transform
               :card_id (serialization/fk-transform :model/Card)}})

(defmethod revisions/spec :model/DashboardCardSeries [_model]
  {:track  [:card_id :position]
   :skip   [:dashboardcard_id]
   :parent {:model :model/DashboardCard :key :dashboardcard_id}})

(defmethod dependencies/spec :model/DashboardCardSeries [_model]
  {:part-of      {:type :dashboard :key :dashboardcard_id :via [:model/DashboardCard :dashboard_id]}
   :part-columns #{:card_id :dashboardcard_id}})
