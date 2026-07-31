(ns metabase.dashboards.models.dashboard-card-series
  (:require
   [metabase.models.serialization :as serdes]
   [metabase.remote-sync.core :as remote-sync]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DashboardCardSeries [_model] :dashboardcard_series)

(doto :model/DashboardCardSeries
  (derive :metabase/model))

(t2/define-before-insert :model/DashboardCardSeries
  [series]
  (remote-sync/inherit-worktree-id series :model/DashboardCard :dashboardcard_id))

(t2/define-before-update :model/DashboardCardSeries
  [series]
  (remote-sync/check-worktree-id-unchanged series)
  (remote-sync/check-parent-same-worktree series :model/DashboardCard :dashboardcard_id)
  series)

(t2/define-after-select :model/DashboardCardSeries
  [series]
  (remote-sync/remove-worktree-id-helper series))

;; Serialization

(defmethod serdes/generate-path "DashboardCardSeries" [_ _] nil)

;; TODO: this is not used atm as `DashboardCard` has custom :export/:import defined; see comment there
;; to be implemented.
(defmethod serdes/make-spec "DashboardCardSeries" [_model-name _opts]
  ;; We did not have `position` in serialization before, it was inferred from the order, but we're trying to keep
  ;; code more generic right now - so it's carried over as data rather than implied.
  {:copy      [:position]
   :skip      [:worktree_id]
   :transform {:dashboardcard_id (serdes/parent-ref)
               :card_id          (serdes/fk :model/Card)}})
