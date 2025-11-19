(ns metabase-enterprise.representations.import
  "Import functionality for Metabase entities from human-readable representations"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.core :as v0-core]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.util.log :as log]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn persist!
  "Ingest a validated representation and create/update the entity in the database."
  [representation ref-index]
  (case (:version representation)
    :v0 (v0-core/persist! representation ref-index)))

(defn yaml->toucan
  "Convert a validated representation into data suitable for creating/updating an entity.
   Returns a map with keys matching the Toucan model fields.
   Does NOT insert into the database - just transforms the data."
  [representation ref-index]
  (case (:version representation)
    :v0 (v0-core/yaml->toucan representation ref-index)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Representation Normalization ;;

(defn insert!
  "Insert a representation as a new entity in the database."
  [representation ref-index]
  (let [representation (rep-read/parse representation)]
    (case (:version representation)
      :v0 (v0-core/insert! representation ref-index))))

(defn update!
  "Update an existing entity from a representation."
  [representation id ref-index]
  (let [representation (rep-read/parse representation)]
    (case (:version representation)
      :v0 (v0-core/update! representation id ref-index))))

(defn- file->collection-id
  [^java.io.File file]
  (let [id
        (-> (.getParent file)
            (str/split #"/")
            last
            (str/split #"_")
            first
            (Long/parseLong))]
    id))

(defn import-yaml
  "Parse a YAML representation file and return the data structure.
   Returns nil if the file cannot be parsed."
  [file]
  (try
    (rep-yaml/from-file file)
    (catch Exception e
      (log/error e "Failed to parse YAML file" file)
      nil)))

(defn- prepare-yaml
  [^java.io.File file]
  (when (or (str/ends-with? (.getName file) ".yml")
            (str/ends-with? (.getName file) ".yaml"))
    (-> (import-yaml file)
        rep-read/parse
        (assoc :collection (file->collection-id file)))))

(defn- yaml-files
  "Returns imported reference models from the yaml files in dir, in safe persistence order."
  [dir]
  (->> (io/file dir)
       file-seq
       (keep prepare-yaml)
       (v0-common/order-representations)))

(defn persist-dir!
  "Given a dir containing yaml representations, sorts them topologically, then persists them in order."
  [dir]
  (let [representations (yaml-files dir)]
    (reduce (fn [index representation]
              (try
                (let [persisted (persist! representation index)]
                  (assoc index (:name representation) persisted))
                (catch Exception e
                  (log/warn "Failed to persist an entity!"
                            (ex-info (format "Entity failed to persist for ref %s. Removing from index." (:name representation))
                                     {:entity representation
                                      :ref-index index}
                                     e))
                  (dissoc index (:name representation)))))
            {}
            representations)))

(defn collection-representations
  "Extract all representations from a collection YAML, including the collection itself,
   its databases, and recursively all child collections."
  [collection-yaml]
  (concat
   [(dissoc collection-yaml :children :databases)]
   (:databases collection-yaml)
   ;; recursive call
   (mapcat collection-representations (:children collection-yaml))))

(defn import-collection-representations
  "Import a whole collection from the associated local directory"
  [id]
  (let [collection (t2/select-one :model/Collection :id id)
        coll-dir (v0-common/file-sys-name id (:name collection) "/")
        coll-path (str v0-common/representations-export-dir coll-dir)]
    (persist-dir! coll-path)))

(defn- flatten-collection-children
  "Flatten collection children and databases into individual representations (excluding the top-level collection itself)."
  [bundle]
  (let [{:keys [children databases]} bundle
        child-reps (mapcat (fn [child]
                             (if (= (:type child) "v0/collection")
                               (concat [child] (flatten-collection-children child))
                               [child]))
                           children)]
    (concat databases child-reps)))

(defn import-collection-yaml
  "Import a collection from a YAML string containing the full bundle.
   Creates collections first (ordered by parent-child), then other entities."
  [yaml-string]
  (let [bundle (-> yaml-string rep-yaml/parse-string rep-read/parse)
        collection-rep (dissoc bundle :children :databases)
        collection-name (:name collection-rep)
        ;; Select ONLY top-level collections with the name:
        existing-collections (t2/select :model/Collection :name collection-name :location "/")]
    (cond (> (count existing-collections) 1)
          (throw (ex-info (str "Multiple collections found with name: " collection-name)
                          {:collection-name collection-name
                           :count (count existing-collections)}))
          (= (count existing-collections) 1)
          (let [existing (first existing-collections)
                archived-name (str collection-name " (archived)")]
            (log/info "Renaming existing collection" collection-name "to" archived-name)
            (t2/update! :model/Collection (:id existing) {:name archived-name})))
    (let [new-collection (persist! collection-rep {})
          collection-id (:id new-collection)
          representations (flatten-collection-children bundle)
          normalized (map rep-read/parse representations)
          ordered (v0-common/order-representations normalized)]
      (reduce (fn [index entity]
                (try
                  (let [persisted (persist! (assoc entity :collection collection-id)
                                            (v0-common/map-entity-index index))]
                    (assoc index (:name entity) persisted))
                  (catch Exception e
                    (log/warnf e "Failed to persist entity with ref %s" (:name entity))
                    (dissoc index (:name entity)))))
              {}
              ordered)
      new-collection)))

;;;;;;;;;;;;;;;;
;; Transforms ;;

(defn import-transform-representations
  "Import all transforms from the associated local directory"
  []
  (let [trans-dir "transforms/"
        trans-path (str v0-common/representations-export-dir trans-dir)]
    (doseq [^java.io.File file (file-seq (io/file trans-path))]
      (when (.isFile file)
        (try
          (let [valid-repr (-> (slurp file)
                               (rep-yaml/parse-string)
                               (rep-read/parse))
                id (-> (:name valid-repr)
                       (str/split #"-")
                       (last)
                       (Long/parseLong))
                toucan-model (yaml->toucan valid-repr nil)
                update-transform (assoc toucan-model
                                        :id id
                                        :updated_at (java.time.OffsetDateTime/now))]
            (t2/update! :model/Transform id update-transform))
          (catch Exception e
            (log/errorf e "Failed to ingest representation file %s" (.getName file))))))))
