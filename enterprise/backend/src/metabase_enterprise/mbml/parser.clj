(ns metabase-enterprise.mbml.parser
  "Front-matter extraction and YAML parsing functions for MBML files.

  Supports extraction of YAML metadata from SQL and Python files using
  METABASE_BEGIN/METABASE_END comment markers, plus YAML parsing and validation."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.mbml.errors :as mbml.errors]
   [metabase-enterprise.mbml.schema :as mbml.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(def ^:dynamic *file*
  "Binding for the name of the current file being parsed for error reporting."
  nil)

(def ^:private comment-styles
  {:sql ["--" #"^--\s?"]
   :python ["#" #"^#\s?"]})

(def ^:private extract-regex
  {:sql    #"(?s)^\s*--\s*METABASE_BEGIN\s*\n(.*?)\n\s*--\s*METABASE_END\s*\n?(.*)"
   :python #"(?s)^\s*#\s*METABASE_BEGIN\s*\n(.*?)\n\s*#\s*METABASE_END\s*\n?(.*)"})

(defn- strip-comments
  [comment-type]
  (let [[comment regex] (comment-styles comment-type)]
    (fn [line]
      (if (str/starts-with? (str/triml line) comment)
        (str/replace-first (str/triml line) regex "")
        line))))

(mu/defn extract-frontmatter :- [:map [:metadata [:maybe :string]]
                                 [:body [:maybe :string]]]
  "Extract YAML front-matter from file content.

  Looks for content between 'METABASE_BEGIN' and 'METABASE_END' markers, in either
  sql-style or python-style comments. It strips the comment prefix and returns both
  the metadata and the remaining source code.

  Args:
    content: file content as string

  Returns:
    Map with :metadata (YAML string) and :body (remaining Python code).
    Returns {:metadata nil :body content} if no front-matter markers found.

  Raises:
    ex-info when unable to make a match"
  [content :- :string
   content-type :- [:enum :sql :python]]
  (if-let [match (re-find (extract-regex content-type) content)]
    (let [[_ frontmatter-raw body] match
          metadata (->> frontmatter-raw
                        str/split-lines
                        (map (strip-comments content-type))
                        (str/join "\n"))]
      {:metadata (when-not (str/blank? metadata) metadata)
       :body     (str/triml body)})
    (throw (mbml.errors/format-frontmatter-error :missing-markers content *file*))))

 ;; Define the file type schema
(def FileType
  "File types we can operate on"
  [:enum :yaml :sql :python :unknown])

(mu/defn detect-file-type :- FileType
  "Determine file type based on extension or content.

   Takes filename/path and returns :yaml, :sql, :python, or :unknown

   Args:
     filename: String filename or path

   Returns:
     Keyword representing the file type"
  [filename :- [:maybe :string]]
  (if filename
    (let [lower-name (u/lower-case-en filename)]
      (cond
        (or (str/ends-with? lower-name ".yml")
            (str/ends-with? lower-name ".yaml")) :yaml
        (str/ends-with? lower-name ".sql") :sql
        (str/ends-with? lower-name ".py") :python
        :else :unknown))
    :unknown))

(mu/defn extract-content :- [:map
                             [:metadata [:maybe :string]]
                             [:body [:maybe :string]]]
  "Extract content from file based on file type.

   Takes file content and type, returns {:metadata yaml-string :body code-string}
   - For YAML files: entire content is metadata, source is nil
   - For SQL/Python: use the extraction functions from Step 2
   - For unknown: return error or nil metadata

   Args:
     content: File content as string
     file-type: Keyword representing file type (:yaml, :sql, :python, :unknown)

   Returns:
     Map with :metadata and :body keys"
  [content :- ms/NonBlankString
   file-type :- FileType]
  (case file-type
    :yaml {:metadata content :body nil}
    :sql (extract-frontmatter content :sql)
    :python (extract-frontmatter content :python)
    :unknown {:metadata nil :body content}))

 ;;; ------------------------------------------ YAML Parsing ---------------------------------------------------

(mu/defn parse-yaml :- [:maybe :map]
  "Parse YAML string into Clojure data structure.

  Uses metabase.util.yaml to parse YAML content with error handling.
  Returns nil for empty/blank input or throws exception for malformed YAML.

  Args:
    yaml-content: YAML string content to parse

  Returns:
    Parsed Clojure map or nil if content is blank

  Throws:
    Exception with structured error details for malformed YAML"
  [yaml-content :- [:maybe :string]]
  (when-not (str/blank? yaml-content)
    (try
      (yaml/parse-string yaml-content)
      (catch Exception e
        ;; Use structured error from errors namespace for better user experience
        (throw (mbml.errors/format-yaml-error yaml-content e *file*))))))

;;; ---------------------------------------- MBML Validation -------------------------------------------------

(mu/defn validate-mbml :- :map
  "Validate parsed MBML data against schema and integrate source code.

  Takes parsed YAML data and optional source code, validates against MBML schemas,
  and returns validated map with source field populated if provided.

  Args:
    parsed-data: Clojure map from YAML parsing
    source-code: Optional source code string to add to validated entity

  Returns:
    Validated MBML entity map with source code integrated

  Throws:
    Exception with validation errors if data doesn't match MBML schema"
  [parsed-data :- :map
   source-code :- [:maybe :string]]
  (try
    (let [validated-data (mu/validate-throw ::mbml.schema/mbml-entity parsed-data)]
      (if source-code
        (assoc validated-data :body source-code)
        validated-data))
    (catch Exception e
      (throw (mbml.errors/format-schema-validation-error e parsed-data *file*)))))
