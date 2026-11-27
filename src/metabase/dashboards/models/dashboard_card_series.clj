(ns metabase.dashboards.models.dashboard-card-series
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; -------------------------------------------------- Model setup ---------------------------------------------------

(methodical/defmethod t2/table-name :model/DashboardCardSeries [_model] :dashboardcard_series)

(doto :model/DashboardCardSeries
  (derive :metabase/model)
  (derive :hook/worktree-id))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-update :model/DashboardCardSeries
  [series]
  (let [changes (t2/changes series)]
    (when (contains? changes :dashboardcard_id)
      (throw (ex-info (tru "You cannot move a series to another dashboard card.") {:status-code 400})))
    series))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-dashboard-card-series! :- [:sequential :map]
  "Insert the DashboardCardSeries `rows` in one transaction and return the inserted instances."
  [rows :- [:sequential ::dashboards.schema/dashboard-card-series.create]]
  (app-db/create-batched! :model/DashboardCardSeries rows {}))

(mu/defn update-dashboard-card-series! :- :nil
  "Apply the columns of each of `updates`, each holding the `:id` of its DashboardCardSeries, in one transaction."
  [updates :- [:sequential ::dashboards.schema/dashboard-card-series.update]]
  (app-db/update-batched! :model/DashboardCardSeries updates {}))

(mu/defn delete-dashboard-card-series! :- :nil
  "Delete the DashboardCardSeries with `series-ids` in one transaction."
  [series-ids :- [:sequential ms/PositiveInt]]
  (app-db/delete-batched! :model/DashboardCardSeries series-ids {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DashboardCardSeries [_model]
  {:skip? false})

(defmethod serialization/spec :model/DashboardCardSeries [_]
  {:schema    ::dashboards.schema/external-dashboard-card-series
   :identity  [:dashboardcard_id :position]
   :copy      [:position]
   :parent    {:model :model/DashboardCard :key :dashboardcard_id :order :position}
   :insert!   create-dashboard-card-series!
   :update!   #(do (update-dashboard-card-series! %) %)
   :delete!   delete-dashboard-card-series!
   :transform {:dashboardcard_id serialization/import-only-transform
               :card_id (serialization/fk-transform :model/Card)}})
