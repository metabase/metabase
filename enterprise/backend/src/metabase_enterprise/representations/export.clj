(ns metabase-enterprise.representations.export
  "Export functionality for Metabase entities to human-readable representations"
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.representations.common :as common]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.core :as v0]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.collections.api :as coll.api]
   [metabase.util :as mu]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   [java.io File]))

(set! *warn-on-reflection* true)

(defn export-entity
  "Export a Metabase entity to its human-readable representation format.
   Dispatches on [model type] for Cards, [model nil] for other entities."
  [t2-entity]
  ;; v0 because that's the latest version
  (v0/export-entity t2-entity))

(defn- read-from-ref [version ref]
  (let [[type id] (str/split ref #"-" 2)]
    (-> (common/toucan-model {:version version :type (keyword type)})
        (t2/select-one :id (Long/parseLong id))
        (export-entity))))

(defn export-set
  "Returns a transitive set of ref-dependencies"
  [representations]
  (loop [acc (set representations)
         prev #{}]
    (if-some [new (seq (set/difference acc prev))]
      (let [reps (for [rep new
                       :let [version (:version rep)]
                       refs (v0-common/refs rep)]
                   (read-from-ref version refs))]
        (recur (into acc reps) acc))
      acc)))

(defn- munge-name
  "Convert a name to a filesystem-safe format.
  - Preserves Unicode letters (including accented characters and CJK)
  - Preserves numbers
  - Replaces all other characters (spaces, punctuation, emojis, etc.) with hyphens
  - Collapses multiple hyphens into one
  - Removes leading and trailing hyphens
  - Converts to lowercase"
  [name]
  (-> name
      (str/trim)
      ;; Replace any sequence of non-letter, non-number characters with a single hyphen
      ;; This preserves accented characters (é, ñ, ü) and CJK characters
      ;; while replacing emojis, punctuation, and spaces with hyphens
      (str/replace #"[^\p{L}\p{N}]+" "-")
      ;; Remove leading and trailing hyphens
      (str/replace #"^-+|-+$" "")
      (mu/lower-case-en)))

(defn ref-from-name
  "Generate a reference name for each representation based on its display name.
   Munges the display name to create a valid reference identifier."
  [reps]
  (map #(assoc % ::proposed-ref (munge-name (:display_name %))) reps))

(defn add-type
  "Append the entity type to each representation's proposed reference.
   This helps distinguish entities with similar names but different types."
  [reps]
  (map #(update % ::proposed-ref str "-" (name (:type %))) reps))

(defn add-sequence-number
  "Append a sequence number to each representation's proposed reference.
   This ensures uniqueness when other strategies don't provide sufficient disambiguation."
  [reps]
  (map-indexed (fn [i rep]
                 (update rep ::proposed-ref str "-" i))
               reps))

(def standard-ref-strategies
  "Default strategies for generating unique references for exported representations.
   Applied in order to disambiguate entities with conflicting reference names."
  [add-type])

(defn- rename-refs-map
  [representations initial-gen-ref middle-gen-refs final-gen-ref]
  (loop [gen-refs middle-gen-refs
         acc (into #{} (initial-gen-ref representations))]
    (let [gen-ref (or (first gen-refs) final-gen-ref)
          new-ref-to-reps (group-by ::proposed-ref acc)
          acc' (reduce (fn [acc [to-remove to-add]]
                         (into (apply disj acc to-remove) to-add))
                       acc (for [[_ref reps] new-ref-to-reps
                                 :when (> (count reps) 1)]
                             [reps (gen-ref reps)]))]
      (if (= acc' acc) ;; base case
        (into {} (map (juxt :name ::proposed-ref)) acc')
        (recur (rest gen-refs) acc')))))

(defn rename-refs
  "Rename a set of representations based on a sequence of ref strategy functions `gen-refs`.

  Each `gen-ref` takes a sequence of representations and returns a new sequence with proposed refs."
  [representations initial-gen-ref middle-gen-refs final-gen-ref]
  (let [ref-map (rename-refs-map representations initial-gen-ref middle-gen-refs final-gen-ref)
        renamed (mapv #(update % :name ref-map) representations)
        ref:ref-map (into {} (map (fn [[old new]]
                                    [(str "ref:" old) (str "ref:" new)]))
                          ref-map)]
    (->> renamed
         (walk/postwalk-replace ref:ref-map)
         (mapv #(dissoc % ::proposed-ref)))))

(defn- schema->table-index [schema]
  (let [tables (:tables schema)
        index (into {} (map (juxt :name identity)) tables)]
    (assoc schema :tables index)))

(defn- table-index->schema [schema]
  (update schema :tables (comp vec #(sort-by :name %) vals)))

(defn- db->schema-index [db]
  (let [schemas (:schemas db)
        schemas (map schema->table-index schemas)
        index (into {} (map (juxt :name identity)) schemas)]
    (assoc db :schemas index)))

(defn- schema-index->db [db]
  (update db :schemas (comp vec #(sort-by :name %) #(map table-index->schema %) vals)))

(defn- limit-db-to-schemas [db schemas]
  (update db :schemas select-keys schemas))

(defn- limit-schema-to-tables [schema tables]
  (update schema :tables select-keys tables))

(defn reduce-tables
  "Include only schemas and tables in databases referenced by queries in the export set."
  [export-set]
  (let [tables (into #{} (mapcat v0-common/table-refs) export-set)
        referred-to-databases (-> #{}
                                  (into (comp (map :database)
                                              (map v0-common/unref))
                                        tables)
                                  (into (comp (map :database)
                                              (filter some?)
                                              (map v0-common/unref))
                                        export-set))
        db-split (group-by #(= :database (:type %)) export-set)
        databases (get db-split true)
        ;; turn them into a convenient form
        databases (map db->schema-index databases)
        non-databases (get db-split false)
        ;; remove databases that are not referred to
        databases (filter #(contains? referred-to-databases (:name %)) databases)
        tables-by-db (group-by (comp v0-common/unref :database) tables)
        databases (map (fn [db]
                         (let [tables (get tables-by-db (:name db))
                               by-schema (group-by :schema tables)
                               schemas (keys by-schema)
                               ;; remove schemas that are not referred to
                               database (limit-db-to-schemas db schemas)
                               ;; remove tables that are not referred to
                               database (reduce (fn [database [schema tables]]
                                                  (let [tables (into #{} (map :table) tables)]
                                                    (update-in database [:schemas schema] limit-schema-to-tables tables)))
                                                database by-schema)]
                           database))
                       databases)
        ;; turn them back into regular form
        databases (map schema-index->db databases)]
    (-> []
        (into databases)
        (into non-databases))))

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
         coll-dir (str path (v0-common/file-sys-name id (:name collection) "/"))
         refs-dir (str coll-dir "refs/")
         children (-> collection
                      (coll.api/collection-children {:show-dashboard-questions? true :archived? false})
                      :data)
         database-ids (into #{} (mapcat child->database-ids) children)]
     (.mkdirs (File. refs-dir))
     (doseq [db-id database-ids]
       (try
         (let [database (t2/select-one :model/Database :id db-id)
               db-yaml (-> database export-entity rep-yaml/generate-string)
               file-name (v0-common/file-sys-name db-id (:name database) ".database.yml")]
           (spit (str refs-dir file-name) db-yaml))
         (catch Exception e
           (log/errorf e "Unable to export database with id %s" db-id))))
     (doseq [child children]
       (let [child-id (:id child)
             model-type (model->card-type child)]
         (if (= model-type :collection)
           (export-collection-representations child-id coll-dir)
           (try
             (let [card (t2/select-one :model/Card :id child-id :type model-type)
                   entity-yaml (-> card export-entity rep-yaml/generate-string)
                   suffix (format ".%s.yml" (name model-type))
                   card-file-name (v0-common/file-sys-name child-id (:entity_id child) suffix)]
               (spit (str coll-dir card-file-name) entity-yaml))
             (catch Exception e
               (log/errorf e "Unable to export representation of type %s with id %s" model-type child-id)))))))))

(defn export-entire-collection
  "Generate a list of yaml representations to export"
  [id]
  (let [collection (t2/select-one :model/Collection :id id)
        children (-> collection
                     (coll.api/collection-children {:show-dashboard-questions? true :archived? false})
                     :data)
        database-ids (into #{} (mapcat child->database-ids) children)
        child-reps (for [child children]
                     (let [child-id (:id child)
                           model-type (model->card-type child)]
                       (if (= model-type :collection)
                         (export-entire-collection child-id)
                         (-> (t2/select-one :model/Card :id child-id :type model-type)
                             export-entity))))]
    (assoc (export-entity collection)
           :children (map #(dissoc % :databases) child-reps)
           :databases (concat
                       (for [db-id database-ids]
                         (-> (t2/select-one :model/Database :id db-id)
                             export-entity))
                       (mapcat :databases child-reps)))))

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
                                  (rep-yaml/generate-string))
                 file-name (v0-common/file-sys-name transform-id (:name transform) ".yaml")]
             (spit (str path trans-dir file-name) entity-yaml))
           (catch Exception e
             (log/errorf e "Unable to export representation of type transform with id %s" transform-id))))))))
