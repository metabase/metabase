(ns metabase.models.dependency
  (:require [clojure.set :as set]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.models.interface :as i]
            [metabase.util :as u]))

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

(i/defentity Dependency :dependency)


;;; ## Persistence Functions


(defn retrieve-dependencies
  "Get the list of dependencies for a given object."
  [entity id]
  {:pre [(i/metabase-entity? entity)
         (integer? id)]}
  (db/sel :many Dependency :model (:name entity) :model_id id))

(defn update-dependencies
  "Update the set of `Dependency` objects for a given entity."
  [entity id deps]
  {:pre [(i/metabase-entity? entity)
         (integer? id)
         (map? deps)]}
  (let [entity-name      (:name entity)
        dependency-set   (fn [k]
                           ;; TODO: validate that key is a valid entity model
                           (when (every? integer? (k deps))
                             (for [val (k deps)]
                               {:dependent_on_model (name k), :dependent_on_id val})))
        dependencies-old (set (db/sel :many :fields [Dependency :dependent_on_model :dependent_on_id] :model entity-name :model_id id))
        dependencies-new (->> (mapv dependency-set (keys deps))
                              (filter identity)
                              flatten
                              set)
        dependencies+    (set/difference dependencies-new dependencies-old)
        dependencies-    (set/difference dependencies-old dependencies-new)]
    (when (seq dependencies+)
      (let [vs (map #(merge % {:model entity-name, :model_id id, :created_at (u/new-sql-timestamp)}) dependencies+)]
        (k/insert Dependency (k/values vs))))
    (when (seq dependencies-)
      (doseq [{:keys [dependent_on_model dependent_on_id]} dependencies-]
        ;; batch delete would be nice here, but it's tougher with multiple conditions
        (k/delete Dependency (k/where {:model              entity-name
                                       :model_id           id
                                       :dependent_on_model dependent_on_model
                                       :dependent_on_id    dependent_on_id}))))))
