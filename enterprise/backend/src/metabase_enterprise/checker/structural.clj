(ns metabase-enterprise.checker.structural
  "Structural validation for serdes YAML files.

   This checker validates that YAML files are structurally correct without
   resolving references. It's fast feedback that files are well-formed.

   Schemas are defined in checker.schemas (pure Malli) and can be exported
   as JSON Schema for LLM consumption via (export-json-schemas!)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [malli.core :as m]
   [malli.error :as me]
   [malli.json-schema :as mjs]
   [metabase-enterprise.checker.format.serdes :as serdes-format]
   [metabase-enterprise.checker.schemas :as schemas]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Re-export schemas for backward compatibility
;;; ===========================================================================

(def Database    schemas/Database)
(def Table       schemas/Table)
(def Field       schemas/Field)
(def Card        schemas/Card)
(def Dashboard   schemas/Dashboard)
(def Collection  schemas/Collection)
(def schemas     schemas/schemas)

;;; ===========================================================================
;;; Validation
;;; ===========================================================================

(defn- levenshtein
  "Calculate Levenshtein distance between two strings."
  [^String s1 ^String s2]
  (let [len1 (count s1)
        len2 (count s2)]
    (cond
      (zero? len1) len2
      (zero? len2) len1
      :else
      (let [matrix (make-array Long/TYPE (inc len1) (inc len2))]
        (dotimes [i (inc len1)] (aset matrix i 0 (long i)))
        (dotimes [j (inc len2)] (aset matrix 0 j (long j)))
        (dotimes [i len1]
          (dotimes [j len2]
            (let [cost (if (= (.charAt s1 i) (.charAt s2 j)) 0 1)]
              (aset matrix (inc i) (inc j)
                    (long (min (inc (aget matrix i (inc j)))
                               (inc (aget matrix (inc i) j))
                               (+ (aget matrix i j) cost)))))))
        (aget matrix len1 len2)))))

(defn- find-similar-keys
  "Find keys in actual-keys that are similar to target-key."
  [target-key actual-keys & {:keys [max-distance] :or {max-distance 3}}]
  (let [target-str (name target-key)]
    (->> actual-keys
         (map (fn [k]
                (let [k-str (name k)
                      dist (levenshtein target-str k-str)]
                  {:key k :distance dist})))
         (filter #(<= (:distance %) max-distance))
         (sort-by :distance)
         (map :key))))

(defn- schema-required-keys
  "Extract required keys from a Malli map schema."
  [schema]
  (when (and (vector? schema) (= :map (first schema)))
    (->> (rest schema)
         (filter vector?)
         (remove #(and (map? (second %)) (:optional (second %))))
         (map first)
         set)))

(defn- schema-optional-keys
  "Extract optional keys from a Malli map schema."
  [schema]
  (when (and (vector? schema) (= :map (first schema)))
    (->> (rest schema)
         (filter vector?)
         (filter #(and (map? (second %)) (:optional (second %))))
         (map first)
         set)))

(defn- diagnose-errors
  "Analyze validation errors and provide helpful diagnostics.
   Only reports issues for actual validation failures, not extra keys."
  [schema data errors]
  (let [required (schema-required-keys schema)
        optional (schema-optional-keys schema)
        all-schema-keys (into (or required #{}) optional)
        actual-keys (when (map? data) (set (keys data)))
        missing-required (when (and required actual-keys)
                           (clojure.set/difference required actual-keys))
        extra-keys (when (and all-schema-keys actual-keys)
                     (clojure.set/difference actual-keys all-schema-keys))
        diagnostics (atom [])]
    ;; Check for typos in missing required keys
    (doseq [missing missing-required]
      (let [similar (find-similar-keys missing extra-keys)]
        (if (seq similar)
          (swap! diagnostics conj
                 {:type :likely-typo
                  :missing missing
                  :found (first similar)
                  :message (str "Missing required key '" (name missing) "'"
                                " - found '" (name (first similar)) "' which may be a typo")})
          (swap! diagnostics conj
                 {:type :missing-required
                  :key missing
                  :message (str "Missing required key '" (name missing) "'")}))))
    {:raw-errors errors
     :diagnostics @diagnostics}))

(defn validate
  "Validate data against a schema. Returns nil if valid, error map if invalid."
  [schema data]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (when-not (m/validate schema data)
    #_{:clj-kondo/ignore [:discouraged-var]}
    (let [errors (me/humanize (m/explain schema data))]
      (merge {:errors errors}
             (diagnose-errors schema data errors)))))

(defn validate-yaml-file
  "Validate a YAML file against its schema. Returns nil if valid, error map if invalid."
  [schema-type file-path]
  (try
    (let [data (serdes-format/load-yaml file-path)
          schema (get schemas/schemas schema-type)]
      (if schema
        (when-let [errors (validate schema data)]
          (assoc errors :file file-path :type schema-type))
        {:error (str "Unknown schema type: " schema-type)
         :file file-path}))
    (catch Exception e
      {:error (str "Failed to parse YAML: " (.getMessage e))
       :file file-path})))

(defn validate-export-dir
  "Validate all YAML files in an export directory.
   Returns map of {:valid count, :invalid [{:file :errors}...]}."
  [export-dir]
  (let [results (atom {:valid 0 :invalid []})]
    (serdes-format/walk-yaml-files
     export-dir
     (fn [path entity-type]
       (if-let [errors (validate-yaml-file entity-type path)]
         (swap! results update :invalid conj errors)
         (swap! results update :valid inc))))
    @results))

(defn validate-entity
  "Validate entity data against schema. Returns nil if valid, error map if invalid."
  [entity-type data]
  (when-let [schema (get schemas/schemas entity-type)]
    (validate schema data)))

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
  (doseq [[type schema] schemas/schemas
          :let [json-schema (schema->json-schema schema)
                filename (str (name type) ".schema.json")
                path (io/file output-dir filename)]]
    (io/make-parents path)
    (spit path (json/encode json-schema {:pretty true}))
    (println "Wrote" (.getPath path))
    (flush))
  (println "Done. Exported" (count schemas/schemas) "schemas.")
  (flush))

;;; ===========================================================================
;;; CLI / REPL Helpers
;;; ===========================================================================

(defn- format-validation-error
  "Format a validation error for human-readable output."
  [{:keys [file type error diagnostics raw-errors]}]
  (let [lines (atom [(str "\n  " file " (" (name type) ")")])]
    (if error
      (swap! lines conj (str "    " error))
      (if (seq diagnostics)
        (doseq [{:keys [message]} diagnostics]
          (swap! lines conj (str "    - " message)))
        (swap! lines conj (str "    " (pr-str raw-errors)))))
    (str/join "\n" @lines)))

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
      (doseq [inv invalid]
        (println (format-validation-error inv))))
    results))

(defn cli
  "CLI entrypoint for structural validation. Returns results map."
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
  (check "export-dir")
  (export-json-schemas! "/tmp/serdes-schemas")
  (validate-yaml-file :card "export-dir/collections/cards/my-card.yaml")
  (schema->json-schema schemas/Card))
