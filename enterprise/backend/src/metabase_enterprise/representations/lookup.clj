(ns metabase-enterprise.representations.lookup
  (:require
   [metabase-enterprise.representations.v0.common :as v0-common]
   [toucan2.core :as t2]))

(defn lookup-by-id
  "Find and return a toucan entity given the representation type and id."
  [toucan-type id]
  (when (int? id)
    (t2/select-one toucan-type :id id)))

(defn lookup-by-entity-id
  "Find and return a toucan entity given the representation type and entity id."
  [toucan-type entity-id]
  (when (string? entity-id)
    (t2/select-one toucan-type :entity_id entity-id)))

(defn lookup-by-name
  "Find and return a toucan entity given the representation type and its name.

   Will throw an exception if multiple entities are found with the same name."
  [toucan-type name]
  (when (string? name)
    (let [entities (t2/select toucan-type :name name)]
      (cond
        (= 1 (count entities))
        (first entities)

        (< 1 (count entities))
        (throw (ex-info (str "Multiple entities of type " toucan-type " with name '" name "' found in App DB.")
                        {:toucan-type toucan-type
                         :name name
                         :entities entities}))))))

(defn lookup-database-id
  "Looks up a database-id from some reference to a database (ref, id, or entity-id)."
  [ref-index database]
  (v0-common/ensure-not-nil
   (cond
     (integer? database)
     database

     (v0-common/ref? database)
     (-> (v0-common/lookup-entity ref-index database)
         (v0-common/ensure-correct-type :database)
         :id)

     (string? database)
     (-> (or (lookup-by-name      :model/Database database)
             (lookup-by-entity-id :model/Database database))
         (v0-common/ensure-correct-type :database)
         :id))))
