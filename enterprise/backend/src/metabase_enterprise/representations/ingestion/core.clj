(ns metabase-enterprise.representations.ingestion.core
  "Core ingestion functionality for loading representations from YAML files
   and converting them into Metabase entities.

   This namespace handles:
   - Reading and parsing YAML representation files
   - Validating representations against versioned schemas
   - Converting representations to Metabase internal formats
   - Managing references between entities"
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.representations.ingestion.v0.model :as v0-model-ingest]
   [metabase-enterprise.representations.ingestion.v0.question :as v0-question-ingest]
   [metabase-enterprise.representations.schema.core :as schema]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   [java.io File]))

(defn- ingest*
  [valid-representation]
  (case (:type valid-representation)
    :v0/question (v0-question-ingest/ingest! valid-representation)
    :v0/model (v0-model-ingest/ingest! valid-representation)))

(defn- translate*
  [valid-representation]
  (case (:type valid-representation)
    :v0/question (v0-question-ingest/yaml->toucan valid-representation)
    :v0/model (v0-model-ingest/yaml->toucan valid-representation)))

(defn load-representation-yaml
  "Parse a YAML representation file and return the data structure.
   Returns nil if the file cannot be parsed."
  [file]
  (try
    (yaml/from-file file)
    (catch Exception e
      (log/error e "Failed to parse YAML file" file)
      nil)))

(defn validate-representation
  "Validate a parsed representation against its schema.
   Uses the schema.core validation which throws on error.
   Returns the representation if valid, nil if invalid."
  [representation]
  (schema/validate representation))

(defn translate-representation
  "Converts the yaml format into a structure suitable for inserting into the appdb
  with toucan."
  [representation]
  (when-let [validated (validate-representation representation)]
    (translate* validated)))

(defn ingest-representation
  "Ingest a single representation file and convert to Metabase entity.
   Returns the created/updated entity or nil on failure."
  [representation]
  (when-let [validated (validate-representation representation)]
    (ingest* validated)))

;; TOTALLY UNTESTED
(defn ingest-directory
  "Recursively ingest all YAML files in a directory.
   Returns a map of results by file path."
  [directory-path]
  (let [dir (io/file directory-path)]
    (if (.exists dir)
      (let [yaml-files (->> (file-seq dir)
                            (filter #(.endsWith (.getName %) ".yml"))
                            (filter #(.isFile %)))]
        (reduce (fn [results file]
                  (assoc results (.getPath file)
                         (ingest-representation file)))
                {}
                yaml-files))
      (do
        (log/error "Directory does not exist:" directory-path)
        {}))))

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
                                        translate-representation
                                        load-representation-yaml)
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
  (v0-question-ingest/yaml->toucan (load-representation-yaml "/tmp/pre-loaded/c-2-card196324.card.yml"))
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
