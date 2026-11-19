(ns metabase.activity-feed.collection-recent-views
  "The recent views of Collections."
  (:require
   [medley.core :as m]
   [metabase.activity-feed.db :as activity-feed.db]
   [metabase.activity-feed.recent-views.render :as recent-views.render]
   [metabase.activity-feed.recent-views.spec :as recent-views]
   [metabase.models.interface :as mi]))

(set! *warn-on-reflection* true)

(defn render
  "The recent view item of the loaded `collection`, or nil when it must not be shown."
  [collection {:keys [model_id timestamp]}]
  (when-let [collection (let [collection (m/dissoc-in collection [:effective_parent :type])]
                          (and (mi/can-read? collection)
                               (recent-views.render/elide-archived collection)))]
    {:id                 model_id
     :name               (:name collection)
     :description        (:description collection)
     :model              :collection
     :can_write          (mi/can-write? collection)
     :timestamp          (str timestamp)
     :authority_level    (some-> (:authority_level collection) name)
     :collection_type    (some-> (:type collection) name)
     :effective_location (:effective_location collection)
     :parent_collection  (or (:effective_parent collection) (recent-views.render/root-collection))}))

(defmethod recent-views/spec :model/Collection [_model]
  {"collection" {:load   activity-feed.db/recent-view-collections
                 :render render}})
