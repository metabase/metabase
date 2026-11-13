(ns metabase.dashboards.models.dashboard-card-series
  (:require
   [metabase.api.common :as api]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DashboardCardSeries [_model] :dashboardcard_series)

(doto :model/DashboardCardSeries
  (derive :metabase/model)
  (derive :hook/dependencies))

(defn- check-read-keys
  "Throws unless `series` has the columns its permission checks read."
  [series]
  (api/check-500 (contains? series :dashboardcard_id) "No :dashboardcard_id is set for a DashboardCardSeries."))

(defmethod mi/can-read? :model/DashboardCardSeries
  ([series]
   (check-read-keys series)
   (mi/can-read? :model/DashboardCard (:dashboardcard_id series)))
  ([_model pk]
   (mi/can-read? (dashboards.db/dashcard-series pk))))

(defmethod mi/can-write? :model/DashboardCardSeries
  ([series]
   (check-read-keys series)
   (mi/can-write? :model/DashboardCard (:dashboardcard_id series)))
  ([_model pk]
   (mi/can-write? (dashboards.db/dashcard-series pk))))

;; Serialization

(defmethod serialization/spec :model/DashboardCardSeries [_]
  {:schema    ::dashboards.schema/external-dashboard-card-series
   :identity  [:dashboardcard_id :position]
   :copy      [:position]
   :parent    {:model :model/DashboardCard :key :dashboardcard_id :order :position}
   :transform {:dashboardcard_id serialization/import-only-transform
               :card_id (serialization/fk-transform :model/Card)}})
