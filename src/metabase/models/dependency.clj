(ns metabase.models.dependency
  "Dependencies are used to keep track of objects that depend on other objects, and acts as a sort of m2m FK table. For
  example, a Card might use a Segment; a Dependency object will be used to track this dependency so appropriate
  actions can take place or be prevented when something changes."
  (:require [clojure.set :as set]
            [metabase.util.date :as du]
            [toucan
             [db :as db]
             [models :as models]]))

(defprotocol IDependent
  "Methods an entity may optionally implement to control how dependencies of an instance are captured."
  (dependencies [this id instance]
    "Provide a map of dependent models and their corresponding IDs for the given instance.  Each key in the returned map
     must correspond to a valid Metabase entity model otherwise it will be ignored.  Each value for a given key should
     be a collection of unique integer ids for the given model.

     For example:
         (dependencies Card 13 {})  ->  {:Segment [25 134 344]
                                         :Table   [18]}"))


;;; # Dependency Entity

(models/defmodel Dependency :dependency)


;;; ## Persistence Functions


(defn retrieve-dependencies
  "Get the list of dependencies for a given object."
  [entity id]
  {:pre [(models/model? entity)
         (integer? id)]}
  (db/select Dependency, :model (:name entity), :model_id id))

(defn update-dependencies!
  "Update the set of `Dependency` objects for a given entity."
  [entity id deps]
  {:pre [(models/model? entity)
         (integer? id)
         (map? deps)]}
  (let [entity-name      (:name entity)
        dependency-set   (fn [k]
                           ;; TODO: validate that key is a valid entity model
                           (when (every? integer? (k deps))
                             (for [val (k deps)]
                               {:dependent_on_model (name k), :dependent_on_id val})))
        dependencies-old (set (db/select [Dependency :dependent_on_model :dependent_on_id], :model entity-name, :model_id id))
        dependencies-new (->> (mapv dependency-set (keys deps))
                              (filter identity)
                              flatten
                              set)
        dependencies+    (set/difference dependencies-new dependencies-old)
        dependencies-    (set/difference dependencies-old dependencies-new)]
    (when (seq dependencies+)
      (let [vs (map #(merge % {:model entity-name, :model_id id, :created_at (du/new-sql-timestamp)}) dependencies+)]
        (db/insert-many! Dependency vs)))
    (when (seq dependencies-)
      (doseq [{:keys [dependent_on_model dependent_on_id]} dependencies-]
        ;; batch delete would be nice here, but it's tougher with multiple conditions
        (db/simple-delete! Dependency
          :model              entity-name
          :model_id           id
          :dependent_on_model dependent_on_model
          :dependent_on_id    dependent_on_id)))))
