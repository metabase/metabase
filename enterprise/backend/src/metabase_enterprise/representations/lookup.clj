(ns metabase-enterprise.representations.lookup
  (:require
   [metabase-enterprise.representations.v0.common :as v0-common]
   [toucan2.core :as t2]))

(defn lookup-by-id
  "Find and return a toucan entity given the representation type and id."
  [rep-type id]
  (when (int? id)
    (t2/select-one (v0-common/type->model rep-type) :id id)))

(defn lookup-by-entity-id
  "Find and return a toucan entity given the representation type and entity id."
  [rep-type entity-id]
  (when (string? entity-id)
    (t2/select-one (v0-common/type->model rep-type) :entity_id entity-id)))

(defn lookup-by-name
  "Find and return a toucan entity given the representation type and its name.

   Will throw an exception if multiple entities are found with the same name."
  [rep-type name]
  (when (string? name)
    (let [entities (t2/select (v0-common/type->model rep-type) :name name)]
      (if (= 1 (count entities))
        (first entities)
        (throw (ex-info (str "Multiple entities of type " rep-type " with name '" name "'.")
                        {:rep-type rep-type
                         :name name
                         :entities entities}))))))

(defn lookup-database-id
  "Looks up a database-id from some reference to a database (ref, id, or entity-id)."
  [ref-index database]
  (if (integer? database)
    database
    (let [database (or (v0-common/lookup-entity ref-index database)
                       (lookup-by-name :database database)
                       (lookup-by-entity-id :database database))]
      (-> (v0-common/ensure-correct-type database :database)
          :id
          (v0-common/ensure-not-nil)))))
