(ns metabase.dashboards.models.dashboard-card-series
  (:require
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DashboardCardSeries [_model] :dashboardcard_series)

(doto :model/DashboardCardSeries
  (derive :metabase/model)
  (derive :hook/remote-synced)
  (derive :hook/dependencies))

;; Serialization

(defmethod serialization/spec :model/DashboardCardSeries [_]
  {:schema    ::dashboards.schema/external-dashboard-card-series
   :identity  [:dashboardcard_id :position]
   :copy      [:position]
   :parent    {:model :model/DashboardCard :key :dashboardcard_id :order :position}
   :transform {:dashboardcard_id serialization/import-only-transform
               :card_id (serialization/fk-transform :model/Card)}})

(defmethod remote-sync/synced-where :model/DashboardCardSeries
  [_model alias ctx]
  [:in (u/qualified-key alias :dashboardcard_id) (remote-sync/synced-ids :model/DashboardCard ctx)])
