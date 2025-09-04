(ns metabase-enterprise.mbml.errors
  "Comprehensive error handling utilities for MBML parser.

  Provides structured error formatting, internationalized messages using deferred-tru,
  and integration with Metabase's error handling patterns including mu/with-api-error-message
  and metabase.util.malli.humanize."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.malli.humanize :as mu.humanize]))

;;; ------------------------------------------ Error Type Definitions ------------------------------------------

(def ^:const error-types
  "Map of error type keywords to human-readable descriptions."
  {:file-not-found (deferred-tru "File not found")
   :empty-file-error (deferred-tru "File is empty")
   :unsupported-format (deferred-tru "Unsupported file format")
   :yaml-parse-error (deferred-tru "YAML parsing error")
   :schema-validation (deferred-tru "Schema validation error")
   :frontmatter-error (deferred-tru "Front-matter extraction error")
   :io-error (deferred-tru "File I/O error")})

;;; ------------------------------------------ Error Context Helpers -------------------------------------------

(defn error-context
  "Create error context map with common fields for MBML errors.

  Args:
    type: Keyword error type from error-types map
    message: Human-readable error message (string or deferred-tru)
    opts: Optional map with additional context (:file, :line, :cause, :data, etc.)

  Returns:
    ex-info object following Metabase error patterns"
  [type message & [opts]]
  (let [opts-map (or opts {})
        msg-str (if (string? message) message (str message))
        ; Also convert context and suggestions to strings
        context-str (when-let [ctx (:context opts-map)]
                      (if (string? ctx) ctx (str ctx)))
        suggestions-str (when-let [suggs (:suggestions opts-map)]
                          (mapv #(if (string? %) % (str %)) suggs))]
    (ex-info msg-str
             (merge
              {:type type
               :message msg-str
               :timestamp (t/instant)}
              (select-keys opts-map [:file :line :data])
              (when context-str {:context context-str})
              (when suggestions-str {:suggestions suggestions-str}))
             (:cause opts-map))))

(defn format-file-context
  "Format file context information for error messages.

  Args:
    file: File path or filename
    line: Optional line number

  Returns:
    Formatted string with file context"
  [file & [line]]
  (if line
    (i18n/tru "in file {0} at line {1}" file line)
    (i18n/tru "in file {0}" file)))

;;; ------------------------------------------ YAML Error Handling ----------------------------------------------

(defn format-yaml-error
  "Format YAML parsing errors with user-friendly context.

  Args:
    yaml-content: Original YAML content that failed to parse
    cause: Original exception/error message
    file: Optional file context

  Returns:
    ex-info object with actionable suggestions"
  [yaml-content cause & [file]]
  (let [lines (str/split-lines (or yaml-content ""))
        line-count (count lines)]
    (error-context
     :yaml-parse-error
     (if file
       (deferred-tru "Failed to parse YAML content {0}" (format-file-context file))
       (deferred-tru "Failed to parse YAML content"))
     {:cause cause
      :file file
      :data {:yaml-content yaml-content
             :line-count line-count}
      :context (when (> line-count 10)
                 (deferred-tru "YAML content has {0} lines - check for indentation or syntax errors" line-count))
      :suggestions [(deferred-tru "Check YAML syntax - ensure proper indentation with spaces (not tabs)")
                    (deferred-tru "Verify that strings with special characters are properly quoted")
                    (deferred-tru "Make sure lists and maps use consistent formatting")]})))

;;; ---------------------------------------- Schema Validation Errors -------------------------------------------

(defn format-schema-validation-error
  "Format Malli schema validation errors using metabase.util.malli.humanize.

  Args:
    exception: Malli exception
    data: data that failed to validate

  Returns:
    ex-info object with humanized validation messages"
  [exception data & [file]]
  (error-context
   :schema-validation
   (if file
     (deferred-tru "MBML validation failed {0}" (format-file-context file))
     (deferred-tru "MBML validation failed"))
   {:file file
    :cause exception
    :data (merge {:failed-data data}
                 (-> exception ex-data :error))
    :context (deferred-tru "The MBML entity structure does not match required schema")
    :suggestions [(deferred-tru "Ensure all required fields are present: entity, name, identifier, database, target")
                  (deferred-tru "Check that entity type is a supported value (e.g., '''model/Transform:v1''')")
                  (deferred-tru "Verify field values are the correct type (strings, arrays, etc.)")]}))

;;; ---------------------------------------- Front-matter Error Handling ----------------------------------------

(defn format-frontmatter-error
  "Format front-matter extraction errors with context and suggestions.

  Args:
    error-type: Specific front-matter error (:missing-markers, :malformed-markers, etc.)
    content: File content that failed processing
    file: Optional file context

  Returns:
    ex-info object with file format specific guidance"
  [error-type content & [file]]
  (let [file-ext (when file
                   (last (str/split file #"\.")))
        suggestions [(deferred-tru "Add METABASE_BEGIN and METABASE_END markers to your file")
                     (if (= file-ext "sql")
                       (deferred-tru "For SQL files, use: -- METABASE_BEGIN and -- METABASE_END")
                       (deferred-tru "For Python files, use: # METABASE_BEGIN and # METABASE_END"))]]
    (error-context
     :frontmatter-error
     (if file
       (deferred-tru "Front-matter extraction failed {0}" (format-file-context file))
       (deferred-tru "Front-matter extraction failed"))
     {:file file
      :data {:content-length (count content)
             :file-extension file-ext
             :error-type error-type}
      :context (deferred-tru "Unable to extract YAML metadata from {0} file" (or file-ext "source"))
      :suggestions suggestions})))

;;; ----------------------------------------- File System Errors --------------------------------------------

(defn format-file-error
  "Format file system related errors (not found, permission, I/O).

  Args:
    error-type: File error type (:file-not-found, :io-error, :permission-denied)
    file: File path that caused the error
    cause: Original exception or error message

  Returns:
    ex-info object with file system context"
  [error-type file cause]
  (let [suggestions (case error-type
                      :file-not-found
                      [(deferred-tru "Check that the file path is correct")
                       (deferred-tru "Verify the file exists and is readable")
                       (deferred-tru "Ensure you have permission to access the file")]

                      :permission-denied
                      [(deferred-tru "Check file permissions - ensure the file is readable")
                       (deferred-tru "Verify you have access to the parent directory")]

                      :io-error
                      [(deferred-tru "Check that the file is not locked by another process")
                       (deferred-tru "Ensure sufficient disk space and system resources")]

                      [(deferred-tru "Check file accessibility and permissions")])]
    (error-context
     error-type
     (deferred-tru "{0} for file: {1}" (get error-types error-type) file)
     {:cause cause
      :file file
      :suggestions suggestions})))

;;; ----------------------------------------- Format Detection Errors -------------------------------------

(defn format-unsupported-file-error
  "Format errors for unsupported file types.

  Args:
    file: File path with unsupported extension
    detected-type: The file type that was detected

  Returns:
    ex-info obj explaining supported formats"
  [file]
  (error-context
   :unsupported-format
   (deferred-tru "Unsupported file format {0}" (format-file-context file))
   {:file file
    :context (deferred-tru "MBML files must use supported file extensions")
    :suggestions [(deferred-tru "Use .yaml or .yml for pure YAML files")
                  (deferred-tru "Use .sql for SQL files with YAML front-matter")
                  (deferred-tru "Use .py for Python files with YAML front-matter")]}))
