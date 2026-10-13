(ns metabase.dashboards.models.dashboard-card-series
  (:require
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.schema]
   [metabase.dependencies.core :as dependencies]
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DashboardCardSeries [_model] :dashboardcard_series)

(doto :model/DashboardCardSeries
  (derive :metabase/model))

(def ^:private dependency-owner
  "The dashboard whose dependencies a dashboard card series is part of."
  {:owner-model :model/Dashboard
   :owner-id    #(some-> (:dashboardcard_id %) dashboards.db/dashcard-dashboard-id)})

(t2/define-before-insert :model/DashboardCardSeries
  [series]
  (dependencies/entity-inserted! :model/DashboardCardSeries series dependency-owner)
  series)

(t2/define-before-update :model/DashboardCardSeries
  [series]
  (dependencies/entity-updated! :model/DashboardCardSeries series
                                (assoc dependency-owner :columns #{:card_id :dashboardcard_id}))
  series)

;; Serialization

(defmethod serdes/generate-path "DashboardCardSeries" [_ _] nil)

;; TODO: this is not used atm as `DashboardCard` has custom :export/:import defined; see comment there
;; to be implemented.
(defmethod serdes/make-spec "DashboardCardSeries" [_model-name _opts]
  ;; We did not have `position` in serialization before, it was inferred from the order, but we're trying to keep
  ;; code more generic right now - so it's carried over as data rather than implied.
  {:copy      [:position]
   :skip      []
   :transform {:dashboardcard_id (serdes/parent-ref)
               :card_id          (serdes/fk :model/Card)}})
