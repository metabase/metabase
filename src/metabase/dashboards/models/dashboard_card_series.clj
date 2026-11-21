(ns metabase.dashboards.models.dashboard-card-series
  (:require
   [medley.core :as m]
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
  (derive :metabase/model))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-update :model/DashboardCardSeries
  [series]
  (let [changes (t2/changes series)]
    (when (contains? changes :dashboardcard_id)
      (throw (ex-info (tru "You cannot move a series to another dashboard card.") {:status-code 400})))
    series))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(def ^:private Result
  [:map {:closed true}
   [:events events/Events]])

(mu/defn create-dashboard-card-series* :- [:map {:closed true}
                                           [:series [:sequential :map]]
                                           [:events events/Events]]
  "Insert the DashboardCardSeries `rows`, returning them as `:series` and their create event as `:events`, which the
  caller publishes."
  [rows :- [:sequential ::dashboards.schema/dashboard-card-series.create]]
  (let [series (if (seq rows) (dashboards.db/insert-dashcard-series! rows) [])]
    {:series series
     :events [(events/created :event/dashboard-card-series-create series)]}))

(mu/defn delete-dashboard-card-series-for-dashcards* :- Result
  "Delete every DashboardCardSeries of the DashboardCards with `dashcard-ids`, returning their delete event as `:events`,
  which the caller publishes."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (let [series (if (seq dashcard-ids) (dashboards.db/dashcard-series-for-dashcards dashcard-ids) [])
        event  (events/deleted :event/dashboard-card-series-delete :model/DashboardCardSeries series)]
    (when (seq series)
      (dashboards.db/delete-series-for-dashcards! dashcard-ids))
    {:events [event]}))

(mu/defn delete-dashboard-card-series! :- :nil
  "Delete the DashboardCardSeries with `series-ids`."
  [series-ids :- [:sequential ms/PositiveInt]]
  (t2/with-transaction [_conn]
    (let [series (dashboards.db/dashcard-series-by-ids series-ids)
          event  (events/deleted :event/dashboard-card-series-delete :model/DashboardCardSeries series)]
      (when (seq series)
        (dashboards.db/delete-dashcard-series! series-ids))
      (events/publish-lifecycle! [event])))
  nil)

(defn- insert-imported-dashboard-card-series!
  "Insert the DashboardCardSeries `rows` of an import and return the inserted instances."
  [rows]
  (t2/with-transaction [_conn]
    (let [series (dashboards.db/insert-dashcard-series! rows)]
      (events/publish-lifecycle! [(events/created :event/dashboard-card-series-create series)])
      series)))

(defn- update-imported-dashboard-card-series!
  "Apply the columns of each of `rows`, each holding the `:id` of its DashboardCardSeries, and return the rows of the
  series that exist."
  [rows]
  (t2/with-transaction [_conn]
    (let [previous (m/index-by :id (if (seq rows) (dashboards.db/dashcard-series-by-ids (mapv :id rows)) []))
          stored   (filterv #(contains? previous (:id %)) rows)
          before   (mapv #(get previous (:id %)) stored)]
      (doseq [[changes group] (group-by #(dissoc % :id) stored)]
        (dashboards.db/update-dashcard-series! (mapv :id group) changes))
      (events/publish-lifecycle! [(events/updated :event/dashboard-card-series-update
                                                  before
                                                  (mapv (fn [row prev] (events/updated-row prev (dissoc row :id))) stored before))])
      stored)))

(defmethod card/delete-followers! :model/DashboardCardSeries
  [_model ids]
  (delete-dashboard-card-series! ids))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DashboardCardSeries [_model]
  {:skip? false})

(defmethod serialization/spec :model/DashboardCardSeries [_]
  {:schema    ::dashboards.schema/external-dashboard-card-series
   :identity  [:dashboardcard_id :position]
   :copy      [:position]
   :parent    {:model :model/DashboardCard :key :dashboardcard_id :order :position}
   :insert!   insert-imported-dashboard-card-series!
   :update!   update-imported-dashboard-card-series!
   :delete!   delete-dashboard-card-series!
   :transform {:dashboardcard_id serialization/import-only-transform
               :card_id (serialization/fk-transform :model/Card)}})

(defmethod revisions/spec :model/DashboardCardSeries [_model]
  {:track  [:card_id :position]
   :skip   [:dashboardcard_id]
   :parent {:model :model/DashboardCard :key :dashboardcard_id}})

(defmethod dependencies/spec :model/DashboardCardSeries [_model]
  {:part-of      {:type :dashboard :key :dashboardcard_id :via [:model/DashboardCard :dashboard_id]}
   :part-columns #{:card_id :dashboardcard_id}})
