(ns metabase.dashboards.recent-views
  "The recent views of Dashboards."
  (:require
   [metabase.activity-feed.recent-views.render :as recent-views.render]
   [metabase.models.interface :as mi]))

(set! *warn-on-reflection* true)

(defn render
  "The recent view item of the loaded `dashboard`, or nil when it must not be shown."
  [dashboard {:keys [model_id timestamp]}]
  (when-let [dashboard (and (mi/can-read? dashboard)
                            (recent-views.render/parent-collection-valid? dashboard)
                            (recent-views.render/elide-archived dashboard))]
    {:id                model_id
     :name              (:name dashboard)
     :description       (:description dashboard)
     :model             :dashboard
     :can_write         (mi/can-write? dashboard)
     :timestamp         (str timestamp)
     :moderated_status  (:moderated-status dashboard)
     :parent_collection (recent-views.render/parent-collection dashboard)}))
