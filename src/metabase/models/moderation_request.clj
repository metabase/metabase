(ns metabase.models.moderation-request
  (:require [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.interface :as i]
            [metabase.models.permissions :as perms]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel ModerationRequest :moderation_request)
(u/strict-extend (class ModerationRequest)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:timestamped? true})
          :types      (constantly {:moderated_item_type :keyword})})

  ;; Todo: this is wrong, but what should it be?
  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)

(def ^:const moderated-item-name->class
  "Map used to relate the type stored in the DB to the actual class of the moderated item (currently questions and
  dashboards)"
  {:card      Card
   :dashboard Dashboard})

(defn add-moderated-items
  "Efficiently add `moderated_item`s (Cards/Dashboards) to a collection of moderation `requests`."
  {:batched-hydrate :moderated_item}
  [requests]
  (when (seq requests)
    (let [item-id-map                    (group-by :moderated_item_type requests)
          moderated-items-by-type-and-id (group-by :item-type (map (fn [[item-type requests-for-type]]
                                                                     (let [item-class (get moderated-item-name->class item-type)
                                                                           item-ids (set (map :moderated_item_id requests-for-type))]
                                                                       {:item-type   item-type
                                                                        :items-by-id (group-by :id (db/select item-class :id item-ids))}))
                                                                   item-id-map))]
      (for [request requests]
        (assoc request :moderated_item
               (-> moderated-items-by-type-and-id
                   (get (:moderated_item_type request))
                   first
                   :items-by-id
                   (get (:moderated_item_id request))
                   first))))))
