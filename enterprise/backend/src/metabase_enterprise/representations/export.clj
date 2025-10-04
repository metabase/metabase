(ns metabase-enterprise.representations.export
  "Export functionality for Metabase entities to human-readable representations"
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.collections.api :as coll.api]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   [java.io File]))

(def ^:dynamic *use-refs*
  "When true (default), export uses refs like 'ref:question-123'.
   When false, export uses direct IDs like database: 5, source-table: 'card__123'.
   Set to false for single-file exports that will be loaded with direct IDs."
  true)

(set! *warn-on-reflection* true)

(comment
  (def export-entity nil)
  (def representation-type nil))

(defmulti representation-type
  "Returns the representation type for an entity (e.g., :question, :model, :metric).
   For plain maps (like MBQL data), uses :type field. For Toucan models, uses t2/model."
  {:arglists '[[entity]]}
  (fn [entity]
    (or (:type entity) (t2/model entity))))

(defmethod representation-type :model/Card [card] (:type card))
(defmethod representation-type :default [entity]
  (or (:type entity) (t2/model entity)))

(defmulti export-entity
  "Export a Metabase entity to its human-readable representation format.
   Dispatches on [model type] for Cards, [model nil] for other entities."
  {:arglists '[[entity]]}
  representation-type)

(defmulti export-mbql-data
  "Export MBQL data for a card. Dispatches on card type (:model or :question).
   Returns MBQL data representation if card has MBQL query, nil for native queries."
  {:arglists '[[card]]}
  :type)

(def ^:private type->model
  {"question"  :model/Card
   "metric"    :model/Card
   "model"     :model/Card
   "database"  :model/Database
   "transform" :model/Transform})

(defn- read-from-ref [ref]
  (if (str/starts-with? ref "mbql-")
    (let [card-ref (subs ref 5)
          [type id] (str/split card-ref #"-" 2)
          card (t2/select-one (type->model type) :id (Long/parseLong id))
          mbql-data (export-mbql-data card)]
      (if mbql-data
        (let [nested-refs (v0-common/refs mbql-data)]
          (mapcat read-from-ref nested-refs))
        []))
    [(let [[type id] (str/split ref #"-" 2)]
       (export-entity (t2/select-one (type->model type) :id (Long/parseLong id))))]))

(defn export-set
  "Returns a transitive set of ref-dependencies"
  [representations]
  (loop [acc (set representations)
         prev #{}]
    (if-some [new (seq (set/difference acc prev))]
      (let [refs (set (mapcat v0-common/refs new))
            reps (mapcat read-from-ref refs)]
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
             (let [card (t2/select-one :model/Card :id child-id :type model-type)
                   entity-yaml (-> card export-entity yaml/generate-string)
                   base-file-name (v0-common/file-sys-name child-id (:entity_id child) "")
                   card-file-name (str base-file-name ".yaml")]
               ;; Write the card YAML file
               (spit (str path coll-dir card-file-name) entity-yaml)
               ;; If this is an MBQL card, also export the MBQL data
               (when (and (get-in card [:dataset_query :type])
                          (= :query (get-in card [:dataset_query :type])))
                 (let [mbql-data (export-mbql-data card)]
                   (when mbql-data
                     (let [mbql-yaml (-> mbql-data export-entity yaml/generate-string)
                           mbql-file-name (str base-file-name ".mbql.yml")]
                       (spit (str path coll-dir mbql-file-name) mbql-yaml))))))
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
