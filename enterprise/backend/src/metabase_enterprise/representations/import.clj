(ns metabase-enterprise.representations.import
  "Import functionality for Metabase entities from human-readable representations"
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmulti persist!
  "Ingest a validated representation and create/update the entity in the database.
   Dispatches on the :type field of the representation."
  {:arglists '([representation ref-index])}
  (fn [entity _ref-index] ((juxt :version :type) entity)))

(defmulti yaml->toucan
  "Convert a validated representation into data suitable for creating/updating an entity.
   Returns a map with keys matching the Toucan model fields.
   Does NOT insert into the database - just transforms the data.
   Dispatches on the :version and :type fields of the representation."
  {:arglists '([representation ref-index])}
  (fn [entity _ref-index] ((juxt :version :type) entity)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Representation Normalization ;;

;; TODO: Move to representations repo
(defmulti type->schema
  "Returns the schema for a given type keyword.
   Each v0 namespace implements this for its own type."
  {:arglists '([{:keys [version type]}])}
  (juxt :version :type))

;; TODO: move to representations repo
(defmethod type->schema :default
  [{:keys [version type] :as schema}]
  (throw (ex-info (format "Unknown version: %s or type: %s" version type) schema)))

;; TODO: move to representations repo
(defn normalize-type
  "Convert the type and version of the representation to keywords."
  [representation]
  (reduce #(update %1 %2 keyword) representation [:version :type]))

;; TODO: move to representations repo
(defn normalize-representation
  "Ensures type is set correctly and de-encodes base64 if necessary."
  [representation]
  (let [representation' (normalize-type representation)]
    (if-let [entity-type (:type representation')]
      (let [version+type (select-keys representation' [:version :type])
            schema (type->schema version+type)]
        (if-not schema
          (throw (ex-info (str "Unknown type: " entity-type) {:type entity-type}))
          (mu/validate-throw schema representation')))
      (throw (ex-info "Missing required field: type" {:representation representation})))))

;; inserting and updating

(defn insert!
  "Insert a representation as a new entity."
  [representation ref-index]
  (let [representation (normalize-representation representation)]
    (if-some [model (v0-common/type->model (name (:type representation)))]
      (let [toucan (yaml->toucan representation ref-index)]
        (t2/insert! model toucan))
      (throw (ex-info (str "Unknown representation type: " (:type representation))
                      {:representation representation
                       :type (:type representation)})))))

(defn update!
  "Update an existing entity from a representation."
  [representation id]
  (let [representation (normalize-representation representation)]
    (if-some [model (v0-common/type->model (name (:type representation)))]
      (let [toucan (->> (yaml->toucan representation)
                        (rep-t2/with-toucan-defaults model))]
        (t2/update! model id toucan))
      (throw (ex-info (str "Unknown representation type: " (:type representation))
                      {:representation representation
                       :type (:type representation)})))))

(defn order-representations
  "Order representations topologically by ref dependency"
  [representations]
  (loop [iterations (count representations) ;; should take at most one iteration per representation
         acc []
         remaining (set representations)]
    (cond
      (empty? remaining) ;; we're done!
      acc

      (neg? iterations) ;; we've used too many iterations, probably in a cycle
      (throw (ex-info "Used too many iterations. Cycle?"
                      {:representations representations}))

      :else
      (let [done (set (map :ref acc))
            ready (filter #(set/subset? (v0-common/refs %) done)
                          remaining)
            acc' (into acc ready)
            next-remaining (set/difference remaining (set acc'))]
        (when (= remaining next-remaining)
          (throw (ex-info "No progress made. Cycle?"
                          {:representations representations})))
        (recur (dec iterations) acc' next-remaining)))))

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
        normalize-representation
        (assoc :collection (file->collection-id file)))))

(defn- yaml-files
  "Returns imported reference models from the yaml files in dir, in safe persistence order."
  [dir]
  (->> (io/file dir)
       file-seq
       (keep prepare-yaml)
       (order-representations)))

(defn persist-dir!
  "Given a dir containing yaml representations, sorts them topologically, then persists them in order."
  [dir]
  (let [representations (yaml-files dir)]
    (reduce (fn [index entity]
              (try
                (let [persisted (persist! entity index)]
                  (assoc index (:ref entity) persisted))
                (catch Exception e
                  (log/warn "Failed to persist an entity!"
                            (ex-info (format "Entity failed to persist for ref %s. Removing from index." (:ref entity))
                                     {:entity entity
                                      :ref-index index}
                                     e))
                  (dissoc index (:ref entity)))))
            {}
            representations)))

(defn collection-representations [collection-yaml]
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

(defn- order-collections
  "Order collections by location depth (parents before children)."
  [collections]
  (sort-by (fn [coll]
             (let [location (or (:location coll) "/")]
               (count (filter #(= % \/) location))))
           collections))

(defn import-collection-yaml
  "Import a collection from a YAML string containing the full bundle.
   Creates collections first (ordered by parent-child), then other entities."
  [yaml-string]
  (let [bundle (-> yaml-string rep-yaml/parse-string normalize-representation)
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
          normalized (map normalize-representation representations)
          ordered (order-representations normalized)]
      (reduce (fn [index entity]
                (try
                  (let [persisted (persist! (assoc entity :collection collection-id)
                                            (v0-common/map-entity-index index))]
                    (assoc index (:ref entity) persisted))
                  (catch Exception e
                    (log/warn e (format "Failed to persist entity with ref %s" (:ref entity)))
                    (dissoc index (:ref entity)))))
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
                               (normalize-representation))
                id (-> (:ref valid-repr)
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
