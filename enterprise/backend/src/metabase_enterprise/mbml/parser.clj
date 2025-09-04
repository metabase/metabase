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
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

;; TODO(edpaget): refactor these to extract shared code; make sure they raise errors
(mu/defn extract-sql-frontmatter :- [:map
                                     [:metadata [:maybe :string]]
                                     [:source [:maybe :string]]]
  "Extract YAML front-matter from SQL file content.
  
  Looks for content between '-- METABASE_BEGIN' and '-- METABASE_END' markers,
  strips the '-- ' comment prefixes, and returns both the metadata and the 
  remaining source code.
  
  Args:
    content: SQL file content as string
    
  Returns:
    Map with :metadata (YAML string) and :source (remaining SQL code).
    Returns {:metadata nil :source content} if no front-matter markers found."
  [content :- ms/NonBlankString]
  (let [begin-pattern #"(?m)^\s*--\s*METABASE_BEGIN\s*$"
        end-pattern #"(?m)^\s*--\s*METABASE_END\s*$"
        begin-match (re-find begin-pattern content)]
    (if-not begin-match
      {:metadata nil :source content}
      (let [after-begin-pos (+ (.indexOf ^String content ^String begin-match) (count begin-match))
            after-begin (subs content after-begin-pos)
            end-match (re-find end-pattern after-begin)]
        (if-not end-match
          {:metadata nil :source content}
          (let [end-pos (.indexOf ^String after-begin ^String end-match)
                frontmatter-raw (subs after-begin 0 end-pos)
                remaining-source (subs after-begin (+ end-pos (count end-match)))
                ;; Strip comment prefixes (-- ) from each line
                frontmatter-lines (str/split-lines frontmatter-raw)
                cleaned-lines (map (fn [line]
                                     (if (str/starts-with? (str/triml line) "--")
                                       (str/replace-first (str/triml line) #"^--\s?" "")
                                       line))
                                   frontmatter-lines)
                metadata (str/join "\n" cleaned-lines)]
            {:metadata (when-not (str/blank? metadata) metadata)
             :source (str/triml remaining-source)}))))))

(mu/defn extract-python-frontmatter :- [:map
                                        [:metadata [:maybe :string]]
                                        [:source [:maybe :string]]]
  "Extract YAML front-matter from Python file content.
  
  Looks for content between '# METABASE_BEGIN' and '# METABASE_END' markers,
  strips the '# ' comment prefixes, and returns both the metadata and the 
  remaining source code.
  
  Args:
    content: Python file content as string
    
  Returns:
    Map with :metadata (YAML string) and :source (remaining Python code).
    Returns {:metadata nil :source content} if no front-matter markers found."
  [^String content :- ms/NonBlankString]
  (let [begin-pattern #"(?m)^\s*#\s*METABASE_BEGIN\s*$"
        end-pattern #"(?m)^\s*#\s*METABASE_END\s*$"
        begin-match (re-find begin-pattern content)]
    (if-not begin-match
      {:metadata nil :source content}
      (let [after-begin-pos (+ (.indexOf ^String content ^String begin-match) (count begin-match))
            ^String after-begin (subs content after-begin-pos)
            ^String end-match (re-find end-pattern after-begin)]
        (if-not end-match
          {:metadata nil :source content}
          (let [end-pos (.indexOf after-begin end-match)
                frontmatter-raw (subs after-begin 0 end-pos)
                remaining-source (subs after-begin (+ end-pos (count end-match)))
                ;; Strip comment prefixes (# ) from each line
                frontmatter-lines (str/split-lines frontmatter-raw)
                cleaned-lines (map (fn [line]
                                     (if (str/starts-with? (str/triml line) "#")
                                       (str/replace-first (str/triml line) #"^#\s?" "")
                                       line))
                                   frontmatter-lines)
                metadata (str/join "\n" cleaned-lines)]
            {:metadata (when-not (str/blank? metadata) metadata)
             :source (str/triml remaining-source)}))))))

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
                             [:source [:maybe :string]]]
  "Extract content from file based on file type.
   
   Takes file content and type, returns {:metadata yaml-string :source code-string}
   - For YAML files: entire content is metadata, source is nil
   - For SQL/Python: use the extraction functions from Step 2  
   - For unknown: return error or nil metadata
   
   Args:
     content: File content as string
     file-type: Keyword representing file type (:yaml, :sql, :python, :unknown)
     
   Returns:
     Map with :metadata and :source keys"
  [content :- ms/NonBlankString
   file-type :- FileType]
  (case file-type
    :yaml {:metadata content :source nil}
    :sql (extract-sql-frontmatter content)
    :python (extract-python-frontmatter content)
    :unknown {:metadata nil :source content}))

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
        (throw (mbml.errors/format-yaml-error yaml-content e))))))

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
        (assoc validated-data :source source-code)
        validated-data))
    (catch Exception e
      (throw (mbml.errors/format-schema-validation-error e parsed-data)))))
