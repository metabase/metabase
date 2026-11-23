(ns metabase.dashboards.models.dashboard-card-series
  (:require
   [medley.core :as m]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.dashboards.db :as dashboards.db]
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
  (derive :metabase/model))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-update :model/DashboardCardSeries
  [series]
  (let [changes (t2/changes series)]
    (when (contains? changes :dashboardcard_id)
      (throw (ex-info (tru "You cannot move a series to another dashboard card.") {:status-code 400})))
    series))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-dashboard-card-series! :- [:sequential :map]
  "Insert the DashboardCardSeries `rows` and return the inserted instances."
  [rows :- [:sequential ::dashboards.schema/dashboard-card-series.create]]
  (dashboards.db/insert-dashcard-series! rows))

(mu/defn update-dashboard-card-series! :- [:sequential :map]
  "Apply the columns of each of `rows`, each holding the `:id` of its DashboardCardSeries, and return the rows of the
  series that exist."
  [rows :- [:sequential ::dashboards.schema/dashboard-card-series.update]]
  (let [stored (m/index-by :id (if (seq rows) (dashboards.db/dashcard-series-by-ids (mapv :id rows)) []))
        rows   (filterv #(contains? stored (:id %)) rows)]
    (dashboards.db/update-dashcard-series! rows)
    rows))

(mu/defn delete-dashboard-card-series! :- :nil
  "Delete the DashboardCardSeries with `series-ids`."
  [series-ids :- [:sequential ms/PositiveInt]]
  (when (seq series-ids)
    (dashboards.db/delete-dashcard-series! (vec series-ids)))
  nil)

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DashboardCardSeries [_model]
  {:skip? false})

(defmethod serialization/spec :model/DashboardCardSeries [_]
  {:schema    ::dashboards.schema/external-dashboard-card-series
   :identity  [:dashboardcard_id :position]
   :copy      [:position]
   :parent    {:model :model/DashboardCard :key :dashboardcard_id :order :position}
   :insert!   create-dashboard-card-series!
   :update!   update-dashboard-card-series!
   :delete!   delete-dashboard-card-series!
   :transform {:dashboardcard_id serialization/import-only-transform
               :card_id (serialization/fk-transform :model/Card)}})
