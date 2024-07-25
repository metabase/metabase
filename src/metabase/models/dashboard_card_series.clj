(ns metabase.models.dashboard-card-series
  (:require
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def DashboardCardSeries
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
   We'll keep this till we replace all the DashboardCardSeries symbol in our codebase."
  :model/DashboardCardSeries)

(methodical/defmethod t2/table-name :model/DashboardCardSeries [_model] :dashboardcard_series)

(doto :model/DashboardCardSeries
  (derive :metabase/model))

;; Serialization

(defmethod serdes/entity-id "DashboardCardSeries" [_ instance] (:card_id instance))

(defmethod serdes/generate-path "DashboardCardSeries" [_ _] nil)

(defmethod serdes/load-find-local "DashboardCardSeries" [path]
  (let [{:keys [id]} (last path)]
    (t2/select-one :model/DashboardCardSeries :card_id {:from   [:report_card]
                                                        :select [:id]
                                                        :where  [:= :entity_id id]})))

(defmethod serdes/make-spec "DashboardCardSeries" [_model-name _opts]
  ;; We did not have position in serialization before, it was inferred from the sequence, but current helper
  ;; (`serdes/nested`) is too generic and does not support that.
  {:copy      [:position]
   :skip      []
   :transform {:dashboardcard_id (serdes/parent-ref)
               :card_id          (serdes/fk :model/Card)}})
