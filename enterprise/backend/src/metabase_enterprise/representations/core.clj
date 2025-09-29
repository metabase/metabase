(ns metabase-enterprise.representations.core
  "Core functionality for the representations module that enables human-writable
   formats for Metabase entities for version control and programmatic management."
  (:require
   [clj-yaml.core :as clj-yaml]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as m]
   [malli.transform :as mt]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.collection :as v0-coll]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.database :as v0-db]
   [metabase-enterprise.representations.v0.document :as v0-doc]
   [metabase-enterprise.representations.v0.metric :as v0-metric]
   [metabase-enterprise.representations.v0.model :as v0-model]
   [metabase-enterprise.representations.v0.question :as v0-question]
   [metabase-enterprise.representations.v0.snippet :as v0-snippet]
   [metabase-enterprise.representations.v0.transform :as v0-transform]
   [metabase.collections.api :as coll.api]
   [metabase.config.core :as config]
   [metabase.models.serialization :as serdes]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   [java.io File]))

(set! *warn-on-reflection* true)

;;; ------------------------------------ Type Registry ------------------------------------

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

;;; ------------------------------------ Public API ------------------------------------

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Validate representation structure

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

(defn validate
  "Validates a representation against its schema based on the type field.

   The type field can be either:
   - Simple: 'question', 'collection' (defaults to v0)
   - Versioned: 'v0/question', 'v1/collection' (explicit version)

   The schemas themselves expect simple types, so we strip the version
   before validation if present.

   Handles both string and keyword keys from YAML parsing.
   Applies JSON decoders to convert strings to appropriate types (e.g., \"scheduled\" -> :scheduled).

   Throws an exception if validation fails.
   Returns the decoded and validated representation if validation passes."
  [representation]
  (let [representation' (normalize-type representation)]
    (if-let [entity-type (:type representation')]
      (let [schema (type->schema entity-type)]
        (if-not schema
          (throw (ex-info (str "Unknown type: " entity-type) {:type entity-type}))
          (mu/validate-throw schema representation')))
      (throw (ex-info "Missing required field: type" {:representation representation})))))

;;;;;;;;;;;
;; Import

(defn yaml->toucan
  "Convert a validated representation into data suitable for creating/updating an entity.
   Returns a map with keys matching the Toucan model fields.
   Does NOT insert into the database - just transforms the data.
   Delegates to the multimethod yaml->toucan for extensibility."
  ([valid-representation]
   (import/yaml->toucan valid-representation nil))
  ([valid-representation ref-index]
   (import/yaml->toucan valid-representation ref-index)))

(defn import-yaml
  "Parse a YAML representation file and return the data structure.
   Returns nil if the file cannot be parsed."
  [file]
  (try
    (yaml/from-file file)
    (catch Exception e
      (log/error e "Failed to parse YAML file" file)
      nil)))

(defn persist!
  "Persist the representation with t2"
  ([representation]
   (persist! representation nil))
  ([representation ref-index]
   (when-let [validated (validate representation)]
     (import/persist! validated ref-index))))

(comment
  (yaml->toucan
   (import-yaml "test_resources/representations/v0/product-performance.model.yml")))

;; =============================================================== ;;

(defn export
  "Export a Metabase entity to its human-readable representation.
   Delegates to the multimethod export-entity for extensibility."
  [t2-model]
  (export/export-entity t2-model))

(defn- write-em
  "Writes representations to a directory `dir`. Will take a collection-id and serialize the whole collection, creating a folder named <collection-name> there. Example, supposing a collection id of 8 with name \"custom\",


  (write-em \"/tmp/\" 8)
  ❯ tree custom
  custom
  ├── c-115-card1147709.card.yml
  ├── c-116-card1148224.card.yml
  └── c-117-card1147694.card.yml

  1 directory, 3 files"
  [dir collection-id]
  (let [collection (t2/select-one :model/Collection :id collection-id)]
    ;; todo: create folder called collection name
    (letfn [(stuff [card]
              (let [card-id (:id card)]
                {:name (:name card)
                 :id card-id
                 :version "1-card"
                 :type :card
                 :ref (format "c-%s-%s" card-id (str (gensym "card")))
                 ;; :sql-query compiled
                 :dataset_query (serdes/export-mbql (:dataset_query card))
                 ;; rows are there to give a preview, this is "dev" only stuff.
                 :rows (try (->> (qp/process-query (:dataset_query card))
                                 :data :rows (take 10))
                            (catch Exception _e [[:error :getting :rows]]))}))
            (write! [card-stuff]
              (let [filename (format "%s/%s/%s.card.yml" dir (:name collection) (:ref card-stuff))]
                (io/make-parents filename)
                (spit filename
                      (clj-yaml/generate-string (dissoc card-stuff :rows :id)
                                                {:dumper-options {:flow-style :block
                                                                  :split-lines false}}))
                (with-open [w (java.io.BufferedWriter. (io/writer filename :append true))]
                  (.newLine w)
                  (.newLine w)
                  (doseq [row (:rows card-stuff)]
                    (.write w (format "# %s\n" row))))))]
      (let [cards (t2/select :model/Card :collection_id collection-id)
            nanos->id (into {} (map (juxt :entity_id :id)) cards)
            cards (map stuff cards)
            id->ref (into {} (map (juxt :id :ref)) cards)
            cards (map (fn [card] (update card :dataset_query
                                          (fn [q] (walk/postwalk (fn [x]
                                                                   (or (some-> x nanos->id id->ref)
                                                                       x))
                                                                 q))))
                       cards)]
        (doseq [card cards]
          (write! card)
          (print ".")
          (flush))))))

;; metabase/test_resources

;; A file to define database references
;; Represent the database schema

(defn populate-folder
  [directory-path]
  (let [ids (atom {:question 0 :model 0 :metric 0 :snippet 0 :collection 0})
        ref->id (atom {})]
    (letfn [(id! [t] (-> ids (swap! update t dec) t))
            (populate [dir collection]
              (let [{yaml false subdirs true} (group-by File/.isDirectory
                                                        (.listFiles (io/file dir)))
                    ingested (into []
                                   (map (fn [file]
                                          (let [content (import-yaml file)
                                                ref (:ref content)
                                                instance (t2/instance :model/Card (yaml->toucan content))
                                                id (id! :question)]
                                            (swap! ref->id assoc ref id)
                                            (assoc instance :id id :collection_id (:id collection)))))
                                   yaml)]
                (apply merge-with into
                       {:question ingested
                        :collection [collection]}
                       (for [subdir subdirs
                             :let [collection' (t2/instance :model/Collection
                                                            {:name (.getName (io/file subdir))
                                                             :id (id! :collection)
                                                             :slug (.getName (io/file subdir))
                                                             :location (str (:location collection) (:id collection) "/")})]]
                         (populate subdir collection')))))
            (fix-refs [ingested refs->id]
              ;; must be a prewalk since we look down one level for card references
              (walk/prewalk
               (let [ref-map? (fn [x]
                                (and (map? x) (= 1 (count x)) (string? (:ref x))))]
                 (fn [x] (cond
                           ;; look ahead for {:source-table {:ref "124"}} to become {:source-table "card__1234"}
                           (and (map? x) (ref-map? ((some-fn :source-table :source_table) x)))
                           (merge x
                                  {:source-table (format "card__%d" (refs->id (:ref ((some-fn :source-table :source_table) x))))})

                           (ref-map? x) (refs->id (:ref x))
                           :else x)))
               ingested))]
      (let [dir (io/file directory-path)]
        (if-not (.exists dir)
          (throw (ex-info (format "Directory does not exist: %s" directory-path) {:directory directory-path}))
          (let [collection (t2/instance :model/Collection {:name (.getName (io/file directory-path))
                                                           :id (id! :collection)
                                                           :slug (.getName (io/file directory-path))
                                                           :location "/"})
                instances (populate dir collection)]
            (fix-refs instances @ref->id)))))))

(defonce static-assets (atom nil))

(defn set-static-assets
  [folder]
  (if-not (.exists (io/file folder))
    (log/errorf "Folder %s does not exist" folder)
    (let [assets (populate-folder folder)]
      (reset! static-assets assets))))

(defn fetch
  [model id]
  (->> @static-assets model (some (fn [x] (when (= (:id x) id) x)))))

(defn record-metadata
  [id metadata]
  (swap! static-assets
         update
         :question
         (fn [qs] (into [] (map (fn [q]
                                  (if (= (:id q) id)
                                    (assoc q :results_metadata metadata)
                                    q)))
                        qs))))
(defn collections
  []
  (:collection @static-assets))

(defn collection-items
  [id]
  (->> @static-assets :question (filter (comp #{id} :collection_id)) (map (fn [c] (assoc c :model "card")))))

(def representations-export-dir "local/representations/")

(defn- file-sys-name [id name suffix]
  (str id "_" (str/replace (u/lower-case-en name) " " "_") suffix))

(defn export-collection-representations
  ([id] (export-collection-representations id representations-export-dir))
  ([id path]
   (let [collection (t2/select-one :model/Collection :id id)
         coll-dir (file-sys-name id (:name collection) "/")
         children (-> collection
                      (coll.api/collection-children {:show-dashboard-questions? true :archived? false})
                      :data)]
     (.mkdirs (File. (str path coll-dir)))
     (doseq [child children]
       (let [child-id (:id child)
             model-type (v0-coll/model->card-type child)]
         (if (= model-type :collection)
           (export-collection-representations child-id (str path coll-dir))
           (try
             (let [entity-yaml (->> model-type
                                    (t2/select-one :model/Card :id child-id :type)
                                    (export)
                                    (yaml/generate-string))
                   file-name (file-sys-name child-id (:name child) ".yaml")]
               (spit (str path coll-dir file-name) entity-yaml))
             (catch Exception e
               (log/errorf e "Unable to export representation of type %s with id %s" model-type child-id)))))))))

(defn import-collection-representations [id]
  (let [collection (t2/select-one :model/Collection :id id)
        coll-dir (file-sys-name id (:name collection) "/")
        coll-path (str representations-export-dir coll-dir)]
    (doseq [file (file-seq (io/file coll-path))]
      (when (.isFile file)
        (let [coll-id (-> (.getParent file)
                          (str/split #"/")
                          last
                          (str/split #"_")
                          first
                          (Long/parseLong))
              valid-repr (-> (slurp file)
                             (yaml/parse-string)
                             (validate))
              id (-> (:ref valid-repr)
                     (str/split #"-")
                     (last)
                     (Long/parseLong))]
          (try
            (let [toucan-model (import/yaml->toucan valid-repr nil)
                  updated-card (assoc toucan-model
                                      :id id
                                      :collection_id coll-id
                                      :updated_at (java.time.OffsetDateTime/now)
                                      :creator_id config/internal-mb-user-id)]
              (t2/update! :model/Card id updated-card))
            (catch Exception e
              (log/errorf e "Failed to ingest representation file %s" (.getName file)))))))))

(comment
  (pst)
  (import/yaml->toucan (load-representation-yaml "/tmp/pre-loaded/c-2-card196324.card.yml") nil)
  (ingest-representation (clj-yaml/parse-string (slurp "/tmp/pre-loaded/c-2-card196324.card.yml")))
  (file-seq (io/file "/tmp/pre-loaded"))
  (fetch :collection -1)
  (populate-folder "/tmp/pre-loaded")
  (set-static-assets "/tmp/pre-loaded")
  (set-static-assets "/tmp/swaperoo")
  (reset! static-assets nil)
  (t2/instance :model/Collection {:name "preloaded"
                                  :slug "preloaded"
                                  :location "/"
                                  :created_at (java.time.OffsetDateTime/now)})
  (type *1)
  (t2/select-one :model/Collection :id 2))

(def ^:private type->model
  {"question" :model/Card
   "metric" :model/Card
   "model" :model/Card
   "database" :model/Database
   "transform" :model/Transform})

(defn- read-from-ref [ref]
  (let [[type id] (str/split ref #"-")]
    (export (t2/select-one (type->model type) :id (Long/parseLong id)))))

(defn export-set [representation]
  (loop [acc #{representation}
         prev #{}]
    (if-some [new (seq (set/difference acc prev))]
      (let [refs (set (mapcat v0-common/refs new))
            reps (map read-from-ref refs)]
        (recur (into acc reps) acc))
      acc)))

(defn order-representations [representations]
  (loop [acc []
         remaining (set representations)]
    (let [done (set (map :ref acc))]
      (if (empty? remaining)
        acc
        (let [ready (filter #(set/subset? (v0-common/refs %) done)
                            remaining)]
          (recur (into acc ready) (set/difference remaining (set acc))))))))

(defn yaml-files
  "Returns imported reference models from the yaml files in dir, in safe persistence order."
  [dir]
  (->> (java.io.File. dir)
       file-seq
       (filter #(str/ends-with? (.getName %) ".yml"))
       (map import-yaml)
       (map validate)
       (order-representations)))

;;;;;;;;

(defn persist-dir!
  "Given a dir containing yaml representations, sorts them topologically, then persists them in order."
  [dir]
  (let [representations (yaml-files dir)]
    (reduce (fn [index entity]
              (try
                (let [persisted (import/persist! entity index)]
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

(comment
  (let [ordered (order-representations other-entities)]
    (reduce (fn [index entity]
              (let [persisted (persist! entity index)]
                (assoc index (:ref entity) persisted)))
            (resolve-databases db-entities)
            ordered))
  #_3)

(comment
  (export-set (export (t2/select-one :model/Card :id 97))))
