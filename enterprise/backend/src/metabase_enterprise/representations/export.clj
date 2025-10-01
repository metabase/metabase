(ns metabase-enterprise.representations.export
  "Export functionality for Metabase entities to human-readable representations"
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.collections.api :as coll.api]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   [java.io File]))

(set! *warn-on-reflection* true)

(comment
  (def export-entity nil)
  (def representation-type nil))

(defmulti representation-type
  "df"
  {:arglists '[[entity]]}
  (fn [entity] (t2/model entity)))

(defmethod representation-type :model/Card [card] (:type card))
(defmethod representation-type :default [entity] (t2/model entity))

(defmulti export-entity
  "Export a Metabase entity to its human-readable representation format.
   Dispatches on [model type] for Cards, [model nil] for other entities."
  {:arglists '[[entity]]}
  representation-type)

(def ^:private type->model
  {"question" :model/Card
   "metric" :model/Card
   "model" :model/Card
   "database" :model/Database
   "transform" :model/Transform})

(defn- read-from-ref [ref]
  (let [[type id] (str/split ref #"-")]
    (export-entity (t2/select-one (type->model type) :id (Long/parseLong id)))))

(defn export-set
  "Returns a transitive set of ref-dependencies"
  [representation]
  (loop [acc #{representation}
         prev #{}]
    (if-some [new (seq (set/difference acc prev))]
      (let [refs (set (mapcat v0-common/refs new))
            reps (map read-from-ref refs)]
        (recur (into acc reps) acc))
      acc)))

(defn- child->database-ids
  "Extract database IDs from a child entity"
  [child]
  (when-let [db-id (:database_id child)]
    [db-id]))

(defn model->card-type
  "Given a model, returns a card-type."
  [model]
  (let [kw (keyword (:model model))]
    (get {:dataset :model :card :question} kw kw)))

(defn export-collection-representations
  "Export the stuff."
  ([id] (export-collection-representations id v0-common/representations-export-dir))
  ([id path]
   (let [collection (t2/select-one :model/Collection :id id)
         coll-dir (v0-common/file-sys-name id (:name collection) "/")
         children (-> collection
                      (coll.api/collection-children {:show-dashboard-questions? true :archived? false})
                      :data)
         database-ids (into #{} (mapcat child->database-ids) children)]
     (.mkdirs (File. (str path coll-dir)))
     (doseq [db-id database-ids]
       (try
         (let [database (t2/select-one :model/Database :id db-id)
               db-yaml (-> database export-entity yaml/generate-string)
               file-name (v0-common/file-sys-name db-id (:name database) ".database.yml")]
           (spit (str path coll-dir file-name) db-yaml))
         (catch Exception e
           (log/errorf e "Unable to export database with id %s" db-id))))
     (doseq [child children]
       (let [child-id (:id child)
             model-type (model->card-type child)]
         (if (= model-type :collection)
           (export-collection-representations child-id (str path coll-dir))
           (try
             (let [entity-yaml (->> model-type
                                    (t2/select-one :model/Card :id child-id :type)
                                    (export-entity)
                                    (yaml/generate-string))
                   file-name (v0-common/file-sys-name child-id (:entity_id child) ".yaml")]
               (spit (str path coll-dir file-name) entity-yaml))
             (catch Exception e
               (log/errorf e "Unable to export representation of type %s with id %s" model-type child-id)))))))))

;;;;;;;;;;;;;;;;
;; Transforms ;;

(defn export-transform-representations
  "Exports transform representations to the associated local dir"
  ([] (export-transform-representations v0-common/representations-export-dir))
  ([path]
   (let [trans-dir "transforms/"
         transforms (t2/select :model/Transform)]
     (.mkdirs (File. (str path trans-dir)))
     (doseq [transform transforms]
       (let [transform-id (:id transform)]
         (try
           (let [entity-yaml (->> (t2/select-one :model/Transform :id transform-id)
                                  export-entity
                                  (yaml/generate-string))
                 file-name (v0-common/file-sys-name transform-id (:name transform) ".yaml")]
             (spit (str path trans-dir file-name) entity-yaml))
           (catch Exception e
             (log/errorf e "Unable to export representation of type transform with id %s" transform-id))))))))
