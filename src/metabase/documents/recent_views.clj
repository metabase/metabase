(ns metabase.documents.recent-views
  "The recent views of Documents."
  (:require
   [metabase.activity-feed.recent-views.render :as recent-views.render]
   [metabase.models.interface :as mi]))

(set! *warn-on-reflection* true)

(defn render
  "The recent view item of the loaded `document`, or nil when it must not be shown."
  [document {:keys [model_id timestamp]}]
  (when-let [document (and (mi/can-read? document)
                           (recent-views.render/parent-collection-valid? document)
                           (recent-views.render/elide-archived document))]
    {:id                model_id
     :name              (:name document)
     :description       ""
     :model             :document
     :can_write         (mi/can-write? document)
     :timestamp         (str timestamp)
     :parent_collection (recent-views.render/parent-collection document)}))
