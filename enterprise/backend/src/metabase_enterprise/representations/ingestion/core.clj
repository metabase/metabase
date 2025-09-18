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
   [metabase.util.yaml :as yaml]))

(defn- ingest*
  [valid-representation]
  (case (:type valid-representation)
    :v0/question (v0-question-ingest/ingest! valid-representation)
    :v0/model (v0-model-ingest/ingest! valid-representation)))

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
