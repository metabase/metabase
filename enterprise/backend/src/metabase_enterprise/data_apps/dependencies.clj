(ns metabase-enterprise.data-apps.dependencies
  "The functions of the dependencies spec of a DataApp."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn hydrate
  "The DataApps `data-apps` with the ids of the cards and the actions of their resource collections, as `:card_ids`
  and `:action_ids`."
  [data-apps]
  (let [collection-ids (into [] (keep :resource_collection_id) data-apps)
        by-collection  (fn [rows] (u/group-by :collection_id :id conj #{} rows))
        card-ids       (when (seq collection-ids) (by-collection (data-apps.db/cards-in-collections collection-ids)))
        action-ids     (when (seq collection-ids) (by-collection (data-apps.db/actions-in-collections collection-ids)))]
    (mapv (fn [{collection-id :resource_collection_id :as data-app}]
            (assoc data-app
                   :card_ids   (get card-ids collection-id #{})
                   :action_ids (get action-ids collection-id #{})))
          data-apps)))

(defn dependencies
  "The dependencies of the hydrated `data-app`: the cards and the actions of its resource collection."
  [{card-ids :card_ids, action-ids :action_ids}]
  {:card   card-ids
   :action action-ids})
