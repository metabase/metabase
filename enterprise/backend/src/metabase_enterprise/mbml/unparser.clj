(ns metabase-enterprise.mbml.unparser
  "MBML Unparser: Converts validated MBML entity maps to library-ready file formats.

  The unparser is the inverse operation of the MBML parser. While the parser reads
  MBML files (YAML, SQL with front-matter, Python with front-matter) and converts
  them to validated Clojure maps, the unparser takes these validated maps and
  converts them back to properly formatted files that can be saved to the library.

  ## Usage Examples

  ```clojure
  ;; Pure YAML output
  (unparse-mbml-to-string entity :yaml)
  
  ;; SQL file with front-matter
  (unparse-mbml-to-file entity :sql \"transforms/daily_sales.sql\")
  
  ;; Auto-detect format from extension
  (when-let [format (detect-format-from-extension file-path)]
    (unparse-mbml-to-file entity format file-path))
  ```"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.mbml.errors :as mbml.errors]
   [metabase-enterprise.mbml.schema :as mbml.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(mu/defn generate-yaml :- :string
  "Converts an MBML entity map to a YAML string.
  
  Validates the entity against the MBML schema after removing any :body key
  that may have been added by the parser. Returns clean YAML output suitable
  for saving to the library.
  
  Parameters:
  - mbml-entity: A map that should be a valid MBML entity (possibly with :body key)
  
  Returns:
  - A YAML string representation of the entity
  
  Raises:
  - Schema validation errors if the entity is invalid after :body removal
  - YAML generation errors if the entity cannot be serialized to YAML"
  [mbml-entity :- :map]
  (let [entity-without-body (dissoc mbml-entity :body)]
    (try
      (let [validated-entity (mu/validate-throw ::mbml.schema/mbml-entity entity-without-body)]
        (yaml/generate-string validated-entity))
      (catch Exception e
        ;; Re-throw schema validation errors as-is (they're already well formatted)
        (if (= :malli.core/invalid (-> e ex-data :type))
          (throw (mbml.errors/format-schema-validation-error e entity-without-body))
          ;; Handle YAML generation errors
          (throw (mbml.errors/format-yaml-error (str entity-without-body) e)))))))

(mu/defn generate-frontmatter :- :string
  "Converts a YAML string to front-matter format for SQL or Python files.
  
  Takes YAML content and wraps it with appropriate comment prefixes and
  METABASE_BEGIN/END markers based on the specified file type.
  
  Parameters:
  - yaml-string: A YAML string containing the metadata
  - file-type: Either :sql or :python to determine comment style
  
  Returns:
  - A string with properly formatted front-matter
  
  Examples:
  For SQL files:
  -- METABASE_BEGIN
  -- entity: model/Transform:v1
  -- name: My Transform
  -- METABASE_END
  
  For Python files:
  # METABASE_BEGIN
  # entity: model/Transform:v1
  # name: My Transform
  # METABASE_END"
  [yaml-string :- :string
   file-type :- [:enum :sql :python]]
  (let [comment-prefix (case file-type
                         :sql "--"
                         :python "#")
        yaml-lines (str/split-lines yaml-string)
        commented-lines (map #(str comment-prefix " " %) yaml-lines)
        begin-marker (str comment-prefix " METABASE_BEGIN")
        end-marker (str comment-prefix " METABASE_END")]
    (str/join "\n"
              (concat [begin-marker]
                      commented-lines
                      [end-marker]))))

(mu/defn generate-content :- :string
  "Generates content based on MBML entity and output format.
  
  Takes an MBML entity map and an output format, then routes to the appropriate
  generation method based on the format:
  
  - For :yaml: returns pure YAML using generate-yaml
  - For :sql and :python: generates YAML from entity (without :body), wraps it
    in front-matter comments, and appends the :body content (if present) after
    the front-matter with proper newline spacing
  
  Parameters:
  - mbml-entity: A map that should be a valid MBML entity (may contain :body key)
  - output-format: The desired output format (:yaml, :sql, or :python)
  
  Returns:
  - A string with the generated content in the specified format
  
  Raises:
  - Schema validation errors if the entity is invalid
  - ExceptionInfo if the output format is invalid"
  [mbml-entity :- :map
   output-format :- [:enum :yaml :sql :python]]
  (case output-format
    :yaml
    (generate-yaml mbml-entity)

    (:sql :python)
    (let [yaml-content (generate-yaml mbml-entity)
          front-matter (generate-frontmatter yaml-content output-format)
          body (:body mbml-entity)]
      (if body
        (str front-matter "\n\n" body)
        front-matter))))

(mu/defn detect-format-from-extension :- [:maybe [:enum :yaml :sql :python]]
  "Detects the output format from a file extension.
  
  Maps common file extensions to their corresponding output formats:
  - .yaml, .yml -> :yaml
  - .sql -> :sql  
  - .py -> :python
  
  Parameters:
  - file-path: A string representing the file path or filename
  
  Returns:
  - The detected format keyword, or nil if the extension is not recognized
  
  Examples:
  (detect-format-from-extension \"model.yaml\") ; => :yaml
  (detect-format-from-extension \"transform.sql\") ; => :sql
  (detect-format-from-extension \"script.py\") ; => :python
  (detect-format-from-extension \"readme.txt\") ; => nil"
  [file-path :- :string]
  (when file-path
    (let [lower-path (u/lower-case-en file-path)]
      (cond
        (or (str/ends-with? lower-path ".yaml")
            (str/ends-with? lower-path ".yml")) :yaml
        (str/ends-with? lower-path ".sql") :sql
        (str/ends-with? lower-path ".py") :python
        :else nil))))

(mu/defn unparse-mbml-to-string :- :string
  "Main public API for converting MBML entity to string output.
  
  Takes an MBML entity map and output format, validates the entity,
  and returns the generated string content in the specified format.
  
  This is the primary function for programmatic generation of MBML
  content as strings. For file output, use `unparse-mbml-to-file`.
  
  Parameters:
  - mbml-entity: A map that should be a valid MBML entity (may contain :body key)
  - output-format: The desired output format (:yaml, :sql, or :python)
  
  Returns:
  - A string with the generated content in the specified format
  
  Raises:
  - Schema validation errors if the entity is invalid
  - ExceptionInfo if the output format is invalid
  
  Examples:
  (unparse-mbml-to-string entity :yaml) ; Pure YAML output
  (unparse-mbml-to-string entity :sql)  ; SQL with front-matter
  (unparse-mbml-to-string entity :python) ; Python with front-matter"
  [mbml-entity :- :map
   output-format :- [:enum :yaml :sql :python]]
  (generate-content mbml-entity output-format))

(mu/defn unparse-mbml-to-file :- :string
  "Main public API for converting MBML entity to file output.
  
  Takes an MBML entity map, output format, and file path, generates
  the content using `unparse-mbml-to-string`, and writes it to the
  specified file. Creates parent directories if they don't exist.
  
  This is the primary function for saving MBML content to files.
  For string output only, use `unparse-mbml-to-string`.
  
  Parameters:
  - mbml-entity: A map that should be a valid MBML entity (may contain :body key)
  - output-format: The desired output format (:yaml, :sql, or :python)
  - file-path: The path where the file should be written
  
  Returns:
  - The file path that was written to (same as input file-path)
  
  Raises:
  - Schema validation errors if the entity is invalid
  - ExceptionInfo if the output format is invalid
  - IOException if the file cannot be written or directories cannot be created
  
  Examples:
  (unparse-mbml-to-file entity :yaml \"model.yaml\")
  (unparse-mbml-to-file entity :sql \"transform.sql\")
  (unparse-mbml-to-file entity :python \"script.py\")"
  [mbml-entity :- :map
   output-format :- [:enum :yaml :sql :python]
   file-path :- :string]
  (try
    (let [content (unparse-mbml-to-string mbml-entity output-format)
          file (java.io.File. ^String file-path)]
      ;; Create parent directories if they don't exist
      (when-let [parent (.getParentFile file)]
        (when-not (.mkdirs parent)
          ;; Only throw if mkdirs failed AND the directory doesn't exist
          (when-not (.exists parent)
            (throw (mbml.errors/format-file-error :io-error file-path
                                                  (str "Failed to create parent directories for: " file-path))))))
      ;; Write content to file
      (spit file-path content)
      ;; Return the file path
      file-path)
    (catch java.io.IOException e
      (throw (mbml.errors/format-file-error :io-error file-path e)))
    (catch java.lang.SecurityException e
      (throw (mbml.errors/format-file-error :permission-denied file-path e)))))
