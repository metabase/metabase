(ns metabase.links.models.link
  "Model definition for CollectionLink - links that appear in collections pointing to resources in other collections."
  (:require
   [clojure.string :as str]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/CollectionLink
  [_model]
  :collection_link)

(doto :model/CollectionLink
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped))

(defn- target-exists-and-readable?
  "Check if the target object exists and the current user can read it."
  [{:keys [target_model target_id]}]
  (when (and target_model target_id)
    (let [model-keyword (keyword "model" (str/capitalize target_model))]
      (try
        (when-let [target (t2/select-one model-keyword :id target_id)]
          (mi/can-read? target))
        (catch Exception _
          ;; If the model doesn't exist or there's any error, return false
          false)))))

(defmethod mi/can-read? :model/CollectionLink
  ([instance]
   ;; Users can read a link if they can read the target object
   (target-exists-and-readable? instance))
  ([_model pk]
   (mi/can-read? (t2/select-one :model/CollectionLink :id pk))))

(mu/defn can-create-link-in-collection?
  "Check if the current user can create a link in the given collection."
  [collection-id :- pos-int?]
  (when-let [collection (t2/select-one :model/Collection :id collection-id)]
    (mi/can-write? collection)))

(defmethod mi/can-create? :model/CollectionLink
  ([_model {:keys [collection_id target_model target_id]}]
   ;; Users can create a link if:
   ;; 1. They have write access to the target collection
   ;; 2. The target object exists and they can read it
   (and (can-create-link-in-collection? collection_id)
        (target-exists-and-readable? {:target_model target_model
                                      :target_id target_id})))
  ([model m _pk]
   ;; For the 3-arity version used by some code paths
   (mi/can-create? model m)))

(defmethod mi/can-write? :model/CollectionLink
  ([instance]
   ;; Users can update/delete a link if they have write access to its collection
   (when-let [collection-id (:collection_id instance)]
     (can-create-link-in-collection? collection-id)))
  ([_model pk]
   (mi/can-write? (t2/select-one :model/CollectionLink :id pk))))

(defmethod mi/perms-objects-set :model/CollectionLink
  [link read-or-write]
  ;; Links use the permissions of their containing collection
  (let [collection-id (:collection_id link)]
    (mi/perms-objects-set (t2/select-one :model/Collection :id collection-id) read-or-write)))

(methodical/defmethod t2/batched-hydrate [:model/CollectionLink :target]
  "Batch hydration for link target objects.
  
  Efficiently loads target objects for multiple links by:
  1. Grouping links by target_model type
  2. Batch-fetching all targets of each model type
  3. Creating a lookup map indexed by (model, id)
  4. Attaching target metadata to each link
  
  If a target no longer exists or is unreadable, returns nil for that target.
  
  Example:
    (t2/hydrate (t2/select :model/CollectionLink :collection_id 123) :target)
    ;; => [{:id 1 :target_model \"card\" :target_id 456 :target {:id 456 :name \"My Card\" ...}} ...]"
  [_model _k links]
  (when (seq links)
    (let [links-by-model (group-by (comp keyword :target_model) links)
          model->id->target
          (into {}
                (for [[model links-of-model] links-by-model
                      :let [target-ids (map :target_id links-of-model)
                            model-keyword (keyword "model" (str/capitalize (name model)))]]
                  (try
                    [model (try
                             (into {}
                                   (map (juxt :id identity))
                                   (t2/select model-keyword :id [:in target-ids]))
                             (catch Exception _
                               {}))]
                    (catch Exception _
                      [model {}]))))]
      (for [link links]
        (let [target-model (keyword (:target_model link))
              target-id (:target_id link)
              target (get-in model->id->target [target-model target-id])]
          (if (and target (mi/can-read? target))
            (assoc link :target target)
            (assoc link :target nil)))))))

