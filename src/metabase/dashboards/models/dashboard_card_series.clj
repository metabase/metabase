(ns metabase.dashboards.models.dashboard-card-series
  (:require
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------ Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/DashboardCardSeries [_model] :dashboardcard_series)

(doto :model/DashboardCardSeries
  (derive :metabase/model)
  (derive :hook/dependencies))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-position
  "Throws a 400 unless the `:position` of `series` is not negative."
  [{:keys [position]}]
  (when-not (nat-int? position)
    (throw (ex-info (tru "A DashboardCardSeries'' position is not negative.") {:status-code 400}))))

(t2/define-before-insert :model/DashboardCardSeries
  [series]
  (when (contains? series :position)
    (check-position series))
  series)

(t2/define-before-update :model/DashboardCardSeries
  [series]
  (let [changes (t2/changes series)]
    (when (contains? changes :dashboardcard_id)
      (throw (ex-info (tru "A DashboardCardSeries cannot move to another DashboardCard.") {:status-code 400})))
    (when (contains? changes :position)
      (check-position series))
    series))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serialization/spec :model/DashboardCardSeries [_]
  {:schema    ::dashboards.schema/external-dashboard-card-series
   :identity  [:dashboardcard_id :position]
   :copy      [:position]
   :parent    {:model :model/DashboardCard :key :dashboardcard_id :order :position}
   :transform {:dashboardcard_id serialization/import-only-transform
               :card_id (serialization/fk-transform :model/Card)}})
