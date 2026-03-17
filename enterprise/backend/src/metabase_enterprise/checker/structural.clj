(ns metabase-enterprise.checker.structural
  "Structural validation for serdes YAML files.

   This checker validates that YAML files are structurally correct without
   resolving references. It's fast feedback that files are well-formed.

   Schemas are defined in Malli and can be exported to JSON Schema for
   LLM consumption via (export-json-schemas!)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [malli.core :as m]
   [malli.error :as me]
   [malli.json-schema :as mjs]
   [metabase.util.json :as json]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Portable Reference Schemas
;;;
;;; Serdes uses vectors to represent references that get resolved on import.
;;; ===========================================================================

(def PortableDatabaseRef
  "Reference to a database by name."
  :string)

(def PortableTableRef
  "Reference to a table: [db-name schema-name table-name].
   schema-name can be null for schema-less databases (e.g., SQLite)."
  [:tuple :string [:maybe :string] :string])

(def PortableFieldRef
  "Reference to a field: [db-name schema-name table-name field-name].
   schema-name can be null for schema-less databases."
  [:tuple :string [:maybe :string] :string :string])

(def PortableCardRef
  "Reference to a card by entity_id."
  :string)

;;; ===========================================================================
;;; Common Schemas
;;; ===========================================================================

(def timestamp-pattern "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.*$")
(def base-type-pattern "^type/\\w+$")

(def Timestamp
  "ISO 8601 timestamp string."
  [:re (re-pattern timestamp-pattern)])

(def BaseType
  "Metabase base type, e.g., type/Integer, type/Text."
  [:re (re-pattern base-type-pattern)])

(def SemanticType
  "Metabase semantic type, e.g., type/PK, type/FK, type/Category."
  [:maybe [:re (re-pattern base-type-pattern)]])

(def VisibilityType
  "Field or table visibility."
  [:maybe [:enum "normal" "hidden" "sensitive" "details-only" "retired"]])

(def SerdesMeta
  "Serdes metadata for identifying entities."
  [:sequential
   [:map
    [:id :string]
    [:model :string]
    [:label {:optional true} :string]]])

;;; ===========================================================================
;;; Database Schema
;;; ===========================================================================

(def Database
  "Schema for database YAML files."
  [:map
   [:name :string]
   [:engine :string]
   [:created_at {:optional true} Timestamp]
   [:settings {:optional true} [:maybe :map]]
   [:serdes/meta SerdesMeta]])

;;; ===========================================================================
;;; Table Schema
;;; ===========================================================================

(def Table
  "Schema for table YAML files."
  [:map
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:created_at {:optional true} Timestamp]
   [:active {:optional true} :boolean]
   [:visibility_type {:optional true} VisibilityType]
   [:schema {:optional true} [:maybe :string]]
   [:db_id {:optional true} :string]
   [:serdes/meta SerdesMeta]])

;;; ===========================================================================
;;; Field Schema
;;; ===========================================================================

(def Field
  "Schema for field YAML files."
  [:map
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:created_at {:optional true} Timestamp]
   [:active {:optional true} :boolean]
   [:visibility_type {:optional true} VisibilityType]
   [:table_id PortableTableRef]
   [:database_type :string]
   [:base_type BaseType]
   [:effective_type {:optional true} [:maybe BaseType]]
   [:semantic_type {:optional true} SemanticType]
   [:fk_target_field_id {:optional true} [:maybe [:or PortableFieldRef :nil]]]
   [:position {:optional true} :int]
   [:serdes/meta SerdesMeta]])

;;; ===========================================================================
;;; Dataset Query Schemas
;;; ===========================================================================

(def NativeQuery
  "Native SQL query."
  [:map
   [:database PortableDatabaseRef]
   [:type [:enum "native"]]
   [:native [:map
             [:query :string]
             [:template-tags {:optional true} :map]]]])

(def MBQLQuery
  "MBQL structured query."
  [:map
   [:database PortableDatabaseRef]
   [:type [:enum "query"]]
   [:query [:map
            [:source-table {:optional true} [:or PortableTableRef :string]]
            [:source-query {:optional true} :map]
            [:aggregation {:optional true} :any]
            [:breakout {:optional true} :any]
            [:filter {:optional true} :any]
            [:joins {:optional true} :any]
            [:order-by {:optional true} :any]
            [:limit {:optional true} :int]
            [:fields {:optional true} :any]
            [:expressions {:optional true} :any]]]])

(def DatasetQuery
  "Either a native or MBQL query."
  [:or NativeQuery MBQLQuery])

;;; ===========================================================================
;;; Card Schema
;;; ===========================================================================

(def ResultMetadataColumn
  "A column in result_metadata."
  [:map
   [:name :string]
   [:base_type {:optional true} [:or BaseType :string]]
   [:display_name {:optional true} :string]
   [:effective_type {:optional true} [:or BaseType :string :nil]]
   [:semantic_type {:optional true} [:or SemanticType :string :nil]]
   [:field_ref {:optional true} :any]
   [:id {:optional true} [:or PortableFieldRef :int :nil]]
   [:table_id {:optional true} [:or PortableTableRef :int :nil]]
   [:fk_target_field_id {:optional true} [:or PortableFieldRef :int :nil]]])

(def Card
  "Schema for card (question/model) YAML files."
  [:map
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:entity_id :string]
   [:created_at {:optional true} Timestamp]
   [:creator_id {:optional true} :string]
   [:display {:optional true} :string]
   [:archived {:optional true} :boolean]
   [:query_type {:optional true} [:enum "query" "native"]]
   [:database_id PortableDatabaseRef]
   [:table_id {:optional true} [:maybe [:or PortableTableRef :nil]]]
   [:dataset_query DatasetQuery]
   [:result_metadata {:optional true} [:maybe [:sequential ResultMetadataColumn]]]
   [:visualization_settings {:optional true} :map]
   [:serdes/meta SerdesMeta]
   [:type {:optional true} [:enum "question" "model" "metric"]]])

;;; ===========================================================================
;;; Dashboard Schema
;;; ===========================================================================

(def DashboardCard
  "A card on a dashboard."
  [:map
   [:entity_id {:optional true} :string]
   [:card_id {:optional true} [:maybe [:or PortableCardRef :nil]]]
   [:row {:optional true} :int]
   [:col {:optional true} :int]
   [:size_x {:optional true} :int]
   [:size_y {:optional true} :int]
   [:parameter_mappings {:optional true} :any]
   [:visualization_settings {:optional true} :map]])

(def Dashboard
  "Schema for dashboard YAML files."
  [:map
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:entity_id :string]
   [:created_at {:optional true} Timestamp]
   [:creator_id {:optional true} :string]
   [:archived {:optional true} :boolean]
   [:dashcards {:optional true} [:sequential DashboardCard]]
   [:parameters {:optional true} :any]
   [:serdes/meta SerdesMeta]])

;;; ===========================================================================
;;; Collection Schema
;;; ===========================================================================

(def Collection
  "Schema for collection YAML files."
  [:map
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:entity_id :string]
   [:created_at {:optional true} Timestamp]
   [:slug {:optional true} :string]
   [:archived {:optional true} :boolean]
   [:serdes/meta SerdesMeta]])

;;; ===========================================================================
;;; Schema Registry
;;; ===========================================================================

(def schemas
  "Map of entity type to schema."
  {:database Database
   :table Table
   :field Field
   :card Card
   :dashboard Dashboard
   :collection Collection})

;;; ===========================================================================
;;; Validation
;;; ===========================================================================

(defn validate
  "Validate data against a schema. Returns nil if valid, error map if invalid."
  [schema data]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (when-not (m/validate schema data)
    #_{:clj-kondo/ignore [:discouraged-var]}
    {:errors (me/humanize (m/explain schema data))
     :value data}))

(defn validate-yaml-file
  "Validate a YAML file against its schema. Returns nil if valid, error map if invalid."
  [schema-type file-path]
  (try
    (let [data (yaml/parse-string (slurp file-path))
          schema (get schemas schema-type)]
      (if schema
        (when-let [errors (validate schema data)]
          (assoc errors :file file-path :type schema-type))
        {:error (str "Unknown schema type: " schema-type)
         :file file-path}))
    (catch Exception e
      {:error (str "Failed to parse YAML: " (.getMessage e))
       :file file-path})))

(defn- infer-entity-type
  "Infer entity type from file path."
  [^String path]
  (cond
    (re-find #"/databases/[^/]+/[^/]+\.yaml$" path) :database
    (re-find #"/tables/[^/]+/[^/]+\.yaml$" path) :table
    (re-find #"/fields/[^/]+\.yaml$" path) :field
    (re-find #"/cards/[^/]+\.yaml$" path) :card
    (re-find #"/dashboards/[^/]+\.yaml$" path) :dashboard
    (re-find #"/collections/[^/]+/[^/]+\.yaml$" path) :collection
    :else nil))

(defn validate-export-dir
  "Validate all YAML files in an export directory.
   Returns map of {:valid count, :invalid [{:file :errors}...]}."
  [export-dir]
  (let [results (atom {:valid 0 :invalid []})]
    (doseq [^File file (file-seq (io/file export-dir))
            :when (.isFile file)
            :when (str/ends-with? (.getName file) ".yaml")
            :let [path (.getPath file)
                  entity-type (infer-entity-type path)]
            :when entity-type]
      (if-let [errors (validate-yaml-file entity-type path)]
        (swap! results update :invalid conj errors)
        (swap! results update :valid inc)))
    @results))

;;; ===========================================================================
;;; JSON Schema Export
;;; ===========================================================================

(defn- stringify-patterns
  "Walk a JSON schema and convert regex patterns to strings."
  [schema]
  (cond
    (instance? java.util.regex.Pattern schema)
    (str schema)

    (map? schema)
    (into {} (map (fn [[k v]] [k (stringify-patterns v)]) schema))

    (sequential? schema)
    (mapv stringify-patterns schema)

    :else schema))

(defn schema->json-schema
  "Convert a Malli schema to JSON Schema."
  [schema]
  (-> (mjs/transform schema)
      stringify-patterns))

(defn export-json-schemas!
  "Export all schemas to JSON Schema files in the given directory."
  [output-dir]
  (doseq [[type schema] schemas
          :let [json-schema (schema->json-schema schema)
                filename (str (name type) ".schema.json")
                path (io/file output-dir filename)]]
    (io/make-parents path)
    (spit path (json/encode json-schema {:pretty true}))
    (println "Wrote" (.getPath path))
    (flush))
  (println "Done. Exported" (count schemas) "schemas.")
  (flush))

;;; ===========================================================================
;;; CLI / REPL Helpers
;;; ===========================================================================

(defn check
  "Validate all files in export-dir. Prints summary and returns results."
  [export-dir]
  (let [results (validate-export-dir export-dir)
        {:keys [valid invalid]} results]
    (println "Structural validation complete:")
    (println "  Valid files:" valid)
    (println "  Invalid files:" (count invalid))
    (when (seq invalid)
      (println "\nErrors:")
      (doseq [{:keys [file type errors error]} invalid]
        (println (str "  " file " (" (name type) ")"))
        (if error
          (println (str "    " error))
          (println (str "    " (pr-str errors))))))
    results))

(defn cli
  "CLI entrypoint for structural validation. Returns results map.

   Usage:
     clojure -X:ee metabase-enterprise.checker.structural/cli :export '\"path/to/export\"'
     clojure -X:ee metabase-enterprise.checker.structural/cli :export '\"path/to/export\"' :output '\"path/to/results.edn\"'
     clojure -X:ee metabase-enterprise.checker.structural/cli :export-schemas '\"path/to/schemas\"'"
  [{:keys [export output export-schemas]}]
  (cond
    export-schemas
    (export-json-schemas! export-schemas)

    export
    (let [results (check export)]
      (when output
        (spit output (pr-str results))
        (println "Results written to:" output))
      results)

    :else
    (do
      (println "Usage:")
      (println "  Validate export:  clojure -X:ee metabase-enterprise.checker.structural/cli :export '\"path/to/export\"'")
      (println "  With output file: clojure -X:ee metabase-enterprise.checker.structural/cli :export '\"path/to/export\"' :output '\"results.edn\"'")
      (println "  Export schemas:   clojure -X:ee metabase-enterprise.checker.structural/cli :export-schemas '\"path/to/schemas\"'"))))

(comment
  ;; Validate an export directory
  (check "export-dir")

  ;; Export JSON schemas for LLM consumption
  (export-json-schemas! "resources/serdes-schemas")

  ;; Validate a single file
  (validate-yaml-file :card "export-dir/collections/cards/my-card.yaml")

  ;; Get JSON Schema for a type
  (schema->json-schema Card))
