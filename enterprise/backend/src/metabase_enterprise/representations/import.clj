(ns metabase-enterprise.representations.import
  "Import functionality for Metabase entities from human-readable representations"
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.representations.v0.collection :as v0-coll]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.database :as v0-db]
   [metabase-enterprise.representations.v0.document :as v0-doc]
   [metabase-enterprise.representations.v0.metric :as v0-metric]
   [metabase-enterprise.representations.v0.model :as v0-model]
   [metabase-enterprise.representations.v0.question :as v0-question]
   [metabase-enterprise.representations.v0.snippet :as v0-snippet]
   [metabase-enterprise.representations.v0.transform :as v0-transform]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmulti persist!
  "Ingest a validated representation and create/update the entity in the database.
   Dispatches on the :type field of the representation."
  {:arglists '[[entity ref-index]]}
  (fn [entity _ref-index] (:type entity)))

(defmulti yaml->toucan
  "Convert a validated representation into data suitable for creating/updating an entity.
   Returns a map with keys matching the Toucan model fields.
   Does NOT insert into the database - just transforms the data.
   Dispatches on the :type field of the representation."
  {:arglists '[[entity ref-index]]}
  (fn [entity _ref-index] (:type entity)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Representation Normalization ;;

(def ^:private type->schema
  "Registry mapping type strings to their corresponding schemas.
   Keys are strings like 'v0/question', values are qualified keywords."
  {:v0/question ::v0-question/question
   :v0/model ::v0-model/model
   :v0/metric ::v0-metric/metric
   :v0/collection ::v0-coll/collection
   :v0/database ::v0-db/database
   :v0/document ::v0-doc/document
   :v0/snippet ::v0-snippet/snippet
   :v0/transform ::v0-transform/transform})

(def ^:private default-version "v0")

(defn- versioned-type
  [type-str]
  (if (str/includes? type-str "/")
    (keyword type-str)
    (keyword default-version type-str)))

(defn normalize-type
  "If the :type of the representation is a string, converts it to a versioned keyword"
  [representation]
  (if-not (string? (:type representation))
    representation
    (update representation :type versioned-type)))

(defn normalize-representation
  "fiddlesticks"
  [representation]
  (let [representation' (normalize-type representation)]
    (if-let [entity-type (:type representation')]
      (let [schema (type->schema entity-type)]
        (if-not schema
          (throw (ex-info (str "Unknown type: " entity-type) {:type entity-type}))
          (mu/validate-throw schema representation')))
      (throw (ex-info "Missing required field: type" {:representation representation})))))

(defn order-representations
  "Order representations topologically by ref dependency"
  [representations]
  (loop [acc []
         remaining (set representations)]
    (let [done (set (map :ref acc))]
      (if (empty? remaining)
        acc
        (let [ready (filter #(set/subset? (v0-common/refs %) done)
                            remaining)
              acc' (into acc ready)]
          (recur acc' (set/difference remaining (set acc'))))))))

(defn- file->collection-id
  [file]
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
    (yaml/from-file file)
    (catch Exception e
      (log/error e "Failed to parse YAML file" file)
      nil)))

(defn- prepare-yaml
  [file]
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

(defn import-collection-representations
  "Import a whole collection from the associated local directory"
  [id]
  (let [collection (t2/select-one :model/Collection :id id)
        coll-dir (v0-common/file-sys-name id (:name collection) "/")
        coll-path (str v0-common/representations-export-dir coll-dir)]
    (persist-dir! coll-path)))

;;;;;;;;;;;;;;;;
;; Transforms ;;

(defn import-transform-representations
  "Import all transforms from the associated local directory"
  []
  (let [trans-dir "transforms/"
        trans-path (str v0-common/representations-export-dir trans-dir)]
    (doseq [file (file-seq (io/file trans-path))]
      (when (.isFile file)
        (try
          (let [valid-repr (-> (slurp file)
                               (yaml/parse-string)
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
