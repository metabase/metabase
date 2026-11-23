(ns metabase.queries.recent-views
  "The recent views of Cards, Models and Metrics."
  (:require
   [metabase.activity-feed.recent-views.render :as recent-views.render]
   [metabase.models.interface :as mi]))

(set! *warn-on-reflection* true)

(defn render-card
  "The recent view item of the loaded Question `card`, or nil when it must not be shown."
  [card {:keys [model_id timestamp]}]
  (when-let [card (and (mi/can-read? card)
                       (recent-views.render/parent-collection-valid? card)
                       (recent-views.render/elide-archived card))]
    {:id                     model_id
     :dashboard              (when (:dashboard_id card)
                               {:name (:dashboard_name card)
                                :id   (:dashboard_id card)})
     :name                   (:name card)
     :database_id            (:database_id card)
     :description            (:description card)
     :display                (some-> card :display name)
     :result_metadata        (:result_metadata card)
     :dataset_query          (:dataset_query card)
     :entity_id              (:entity_id card)
     :visualization_settings (:visualization_settings card)
     :model                  :card
     :can_write              (mi/can-write? card)
     :timestamp              (str timestamp)
     :moderated_status       (:moderated-status card)
     :parent_collection      (recent-views.render/parent-collection card)}))

(defn render-model
  "The recent view item of the loaded Model `dataset`, or nil when it must not be shown."
  [dataset {:keys [model_id timestamp]}]
  (when-let [dataset (and (mi/can-read? dataset)
                          (recent-views.render/parent-collection-valid? dataset)
                          (recent-views.render/elide-archived dataset))]
    {:id                model_id
     :name              (:name dataset)
     :database_id       (:database_id dataset)
     :description       (:description dataset)
     :model             :dataset
     :result_metadata   (:result_metadata dataset)
     :can_write         (mi/can-write? dataset)
     :timestamp         (str timestamp)
     :moderated_status  (:moderated-status dataset)
     :parent_collection (recent-views.render/parent-collection dataset)}))

(defn render-metric
  "The recent view item of the loaded Metric `metric`, or nil when it must not be shown."
  [metric {:keys [model_id timestamp]}]
  (when-let [metric (and (mi/can-read? metric)
                         (recent-views.render/parent-collection-valid? metric)
                         (recent-views.render/elide-archived metric))]
    {:id                model_id
     :name              (:name metric)
     :description       (:description metric)
     :display           (some-> metric :display name)
     :model             :metric
     :result_metadata   (:result_metadata metric)
     :can_write         (mi/can-write? metric)
     :timestamp         (str timestamp)
     :moderated_status  (:moderated-status metric)
     :parent_collection (recent-views.render/parent-collection metric)}))
