(ns metabase-enterprise.representations.core
  "Core functionality for the representations module that enables human-writable
   formats for Metabase entities for version control and programmatic management."
  (:require
   [clj-yaml.core :as clj-yaml]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.representations.v0.collection :as v0-coll]
   [metabase-enterprise.representations.v0.database :as v0-db]
   [metabase-enterprise.representations.v0.document :as v0-doc]
   [metabase-enterprise.representations.v0.model :as v0-model]
   [metabase-enterprise.representations.v0.question :as v0-question]
   [metabase-enterprise.representations.v0.snippet :as v0-snippet]
   [metabase-enterprise.representations.v0.transform :as v0-transform]
   [metabase.models.serialization :as serdes]
   [metabase.query-processor :as qp]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.yaml :as mb-yaml]
   [toucan2.core :as t2])
  (:import
   [java.io File]))

(set! *warn-on-reflection* true)

;;; ------------------------------------ Type Registry ------------------------------------

(def ^:private type->schema
  "Registry mapping type strings to their corresponding schemas.
   Keys are strings like 'v0/question', values are qualified keywords."
  {:v0/question   ::v0-question/question
   :v0/model      ::v0-model/model
   ;; :v0/metric ::v0-card/metric
   :v0/collection ::v0-coll/collection
   :v0/database   ::v0-db/database
   :v0/document   ::v0-doc/document
   :v0/snippet    ::v0-snippet/snippet
   :v0/transform  ::v0-transform/transform})

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

   Throws an exception if validation fails.
   Returns the representation if validation passes."
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

;; TODO: replace with multimethods
(defn- ingest*
  [valid-representation]
  (case (:type valid-representation)
    :v0/question (v0-question/persist! valid-representation)
    :v0/model (v0-model/persist! valid-representation)))

(defn- translate*
  [valid-representation]
  (case (:type valid-representation)
    :v0/question (v0-question/yaml->toucan valid-representation)
    :v0/model (v0-model/yaml->toucan valid-representation)))

(defn import-yaml ; load-representation-yaml
  "Parse a YAML representation file and return the data structure.
   Returns nil if the file cannot be parsed."
  [file]
  (try
    (mb-yaml/from-file file)
    (catch Exception e
      (log/error e "Failed to parse YAML file" file)
      nil)))

(defn yaml->toucan
  "Converts the yaml format into our internal toucan structure"
  [representation]
  (when-let [validated (validate representation)]
    (translate* validated)))

(defn persist!
  "Persist the representation with t2"
  [representation]
  (when-let [validated (validate representation)]
    (ingest* validated)))

(comment
  (yaml->toucan
   (import-yaml "test_resources/representations/v0/product-performance.model.yml")))

;; =============================================================== ;;

;; this probably exists somewhere
(defn- remove-nils [map]
  (reduce (fn [map [k v]]
            (if (nil? v)
              map
              (assoc map k v)))
          {} map))

(defn card-ref [card]
  (format "%s-%s" (name (:type card)) (:id card)))

(defn export-card [type question]
  (let [query (serdes/export-mbql (:dataset_query question))]
    (cond-> {:name (:name question)
             ;;:version "question-v0"
             :type type
             :ref (format "%s-%s" (name type) (:id question))
             :description (:description question)}

      (= :native (:type query))
      (assoc :query (-> query :native :query)
             :database (:database query))

      (= :query (:type query))
      (assoc :mbql_query (:query query)
             :database (:database query))

      :always
      remove-nils)))

(defn export-collection [collection]
  (-> {:type "collection"
       :ref (format "%s-%s" "collection" (:id collection))
       :name (:name collection)
       :description (:description collection)}
      remove-nils))

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
  (let [ids (atom {:question 0 :model 0 :metric 0 :snippet 0 :collection 0})]
    (letfn [(id! [t] (-> ids (swap! update t dec) t))
            (populate [dir collection]
              (let [{yaml false subdirs true} (group-by File/.isDirectory
                                                        (.listFiles (io/file dir)))
                    ingested (map (comp (fn [c] (t2/instance :model/Card
                                                             (assoc c
                                                                    :id (id! :question)
                                                                    :collection_id (:id collection))))
                                        yaml->toucan
                                        import-yaml)
                                  yaml)]
                (apply merge-with concat
                       {:question ingested
                        :collection [collection]}
                       (for [subdir subdirs
                             :let [collection' (t2/instance :model/Collection
                                                            {:name     (.getName (io/file subdir))
                                                             :id       (id! :collection)
                                                             :slug     (.getName (io/file subdir))
                                                             :location (str (:location collection) (:id collection) "/")})]]
                         (populate subdir collection')))))]
      (let [dir (io/file directory-path)]
        (if-not (.exists dir)
          (throw (ex-info (format "Directory does not exist: %s" directory-path) {:directory directory-path}))
          (let [collection (t2/instance :model/Collection {:name     (.getName (io/file directory-path))
                                                           :id       (id! :collection)
                                                           :slug     (.getName (io/file directory-path))
                                                           :location "/"})]
            (populate dir collection)))))))

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

(defn collections
  []
  (:collection @static-assets))

(defn collection-items
  [id]
  (->> @static-assets :question (filter (comp #{id} :collection_id)) (map (fn [c] (assoc c :model "card")))))

(comment
  (pst)
  (v0-question/yaml->toucan (load-representation-yaml "/tmp/pre-loaded/c-2-card196324.card.yml"))
  (ingest-representation (clj-yaml.core/parse-string (slurp "/tmp/pre-loaded/c-2-card196324.card.yml")))
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
