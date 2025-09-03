(ns metabase-enterprise.mbml.errors-test
  "Comprehensive unit tests for MBML error handling utilities.

  Tests all error formatting functions with inline test data, edge cases,
  and validation of internationalized error messages."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.mbml.errors :as mbml.errors]
   [metabase.util.i18n :as i18n]))

;;; ------------------------------------------ Error Context Tests ------------------------------------------

(deftest error-context-test
  (testing "error-context creates structured error maps"
    (let [error (mbml.errors/error-context
                 :yaml-parse-error
                 "Test error message"
                 {:file "test.yaml"
                  :line 42
                  :data {:key "value"}
                  :context "Additional context"
                  :suggestions ["Fix this" "Try that"]})]

      (is (instance? clojure.lang.ExceptionInfo error))
      (is (= "Test error message" (.getMessage error)))

      (let [data (ex-data error)]
        (is (= :yaml-parse-error (:type data)))
        (is (= "Test error message" (:message data)))
        (is (= "test.yaml" (:file data)))
        (is (= 42 (:line data)))
        (is (= {:key "value"} (:data data)))
        (is (= "Additional context" (:context data)))
        (is (= ["Fix this" "Try that"] (:suggestions data)))
        (is (instance? java.time.Instant (:timestamp data))))))

  (testing "error-context handles minimal inputs"
    (let [error (mbml.errors/error-context :file-not-found "File missing")]
      (is (instance? clojure.lang.ExceptionInfo error))
      (is (= "File missing" (.getMessage error)))

      (let [data (ex-data error)]
        (is (= :file-not-found (:type data)))
        (is (= "File missing" (:message data)))
        (is (instance? java.time.Instant (:timestamp data)))
        (is (nil? (:file data)))
        (is (nil? (:line data))))))

  (testing "error-context handles cause exceptions"
    (let [root-cause (Exception. "Root problem")
          error (mbml.errors/error-context
                 :io-error
                 "IO failed"
                 {:cause root-cause
                  :file "data.yaml"})]

      (is (instance? clojure.lang.ExceptionInfo error))
      (is (= root-cause (.getCause error)))

      (let [data (ex-data error)]
        (is (= :io-error (:type data)))
        (is (= "data.yaml" (:file data)))))))

;;; ---------------------------------------- File Context Tests ------------------------------------------

(deftest format-file-context-test
  (testing "format-file-context with line numbers"
    (is (= "in file test.yaml at line 42"
           (mbml.errors/format-file-context "test.yaml" 42)))
    (is (= "in file /path/to/data.sql at line 1"
           (mbml.errors/format-file-context "/path/to/data.sql" 1))))

  (testing "format-file-context without line numbers"
    (is (= "in file test.yaml"
           (mbml.errors/format-file-context "test.yaml")))
    (is (= "in file /absolute/path/script.py"
           (mbml.errors/format-file-context "/absolute/path/script.py"))))

  (testing "format-file-context edge cases"
    (is (= "in file  at line 0"
           (mbml.errors/format-file-context "" 0)))
    (is (= "in file filename.txt"
           (mbml.errors/format-file-context "filename.txt" nil)))))

;;; ------------------------------------------ YAML Error Tests ------------------------------------------

(deftest format-yaml-error-test
  (testing "format-yaml-error with file context"
    (let [yaml-content "invalid: yaml: content:\n  - missing\n    quote"
          cause (Exception. "YAML parsing failed")
          error (mbml.errors/format-yaml-error yaml-content cause "test.yaml")]

      (is (instance? clojure.lang.ExceptionInfo error))
      (is (= cause (.getCause error)))

      (let [data (ex-data error)]
        (is (= :yaml-parse-error (:type data)))
        (is (= "test.yaml" (:file data)))
        (is (= yaml-content (get-in data [:data :yaml-content])))
        (is (= 3 (get-in data [:data :line-count])))
        (is (vector? (:suggestions data)))
        (is (some #(re-find #"indentation" %) (:suggestions data))))))

  (testing "format-yaml-error without file context"
    (let [yaml-content "bad:\nyaml"
          cause (Exception. "Parse error")
          error (mbml.errors/format-yaml-error yaml-content cause)]

      (let [data (ex-data error)]
        (is (= :yaml-parse-error (:type data)))
        (is (nil? (:file data)))
        (is (= yaml-content (get-in data [:data :yaml-content]))))))

  (testing "format-yaml-error with empty content"
    (let [error (mbml.errors/format-yaml-error "" (Exception. "Empty"))]
      (let [data (ex-data error)]
        (is (= "" (get-in data [:data :yaml-content])))
        (is (= 1 (get-in data [:data :line-count])))))) ; empty string creates 1 line

  (testing "format-yaml-error with large content provides context"
    (let [large-yaml (str/join "\n" (repeat 50 "line: value"))
          error (mbml.errors/format-yaml-error large-yaml (Exception. "Large file error"))]
      (let [data (ex-data error)]
        (is (= 50 (get-in data [:data :line-count])))
        (is (string? (:context data)))
        (is (re-find #"50 lines" (:context data)))))))

;;; ------------------------------------- Schema Validation Error Tests -------------------------------------

(deftest format-schema-validation-error-test
  (testing "format-schema-validation-error with file context"
    (let [explanation {:errors [{:name "missing required field"}
                                {:entity "invalid entity type"}]}
          invalid-data {:entity "invalid" :database "test"}
          error (mbml.errors/format-schema-validation-error explanation invalid-data "transform.yaml")]

      (is (instance? clojure.lang.ExceptionInfo error))

      (let [data (ex-data error)]
        (is (= :schema-validation (:type data)))
        (is (= "transform.yaml" (:file data)))
        (is (= invalid-data (get-in data [:data :failed-data])))
        (is (= (:errors explanation) (get-in data [:data :raw-errors])))
        (is (vector? (:suggestions data)))
        (is (some #(re-find #"required fields" %) (:suggestions data))))))

  (testing "format-schema-validation-error without file context"
    (let [explanation {:errors [{:path [:identifier] :message "blank identifier"}]}
          invalid-data {:name "test"}
          error (mbml.errors/format-schema-validation-error explanation invalid-data)]

      (let [data (ex-data error)]
        (is (= :schema-validation (:type data)))
        (is (nil? (:file data)))
        (is (= invalid-data (get-in data [:data :failed-data]))))))

  (testing "format-schema-validation-error suggestions are comprehensive"
    (let [error (mbml.errors/format-schema-validation-error {:errors []} {})]
      (let [suggestions (:suggestions (ex-data error))]
        (is (>= (count suggestions) 3))
        (is (some #(re-find #"entity.*identifier.*database.*target" %) suggestions))
        (is (some #(re-find #"Transform:v1" %) suggestions))))))

;;; --------------------------------------- Front-matter Error Tests ---------------------------------------

(deftest format-frontmatter-error-test
  (testing "format-frontmatter-error for missing markers"
    (let [content "SELECT * FROM table -- no METABASE markers"
          error (mbml.errors/format-frontmatter-error :missing-markers content "query.sql")]

      (let [data (ex-data error)]
        (is (= :frontmatter-error (:type data)))
        (is (= "query.sql" (:file data)))
        (is (= :missing-markers (get-in data [:data :error-type])))
        (is (= (count content) (get-in data [:data :content-length])))
        (is (= "sql" (get-in data [:data :file-extension])))
        (is (some #(re-find #"METABASE_BEGIN.*METABASE_END" %) (:suggestions data)))
        (is (some #(re-find #"-- METABASE_BEGIN" %) (:suggestions data))))))

  (testing "format-frontmatter-error for malformed markers"
    (let [content "# METABASE_BEGIN\n# missing end marker"
          error (mbml.errors/format-frontmatter-error :malformed-markers content "script.py")]

      (let [data (ex-data error)]
        (is (= :malformed-markers (get-in data [:data :error-type])))
        (is (= "py" (get-in data [:data :file-extension])))
        (is (some #(re-find #"separate lines" %) (:suggestions data)))
        (is (some #(re-find #"# METABASE_BEGIN" %) (:suggestions data))))))

  (testing "format-frontmatter-error for multiple blocks"
    (let [content "# METABASE_BEGIN\ndata1\n# METABASE_END\n# METABASE_BEGIN\ndata2\n# METABASE_END"
          error (mbml.errors/format-frontmatter-error :multiple-blocks content "multi.py")]

      (let [data (ex-data error)]
        (is (= :multiple-blocks (get-in data [:data :error-type])))
        (is (some #(re-find #"Only one.*block.*allowed" %) (:suggestions data))))))

  (testing "format-frontmatter-error without file extension"
    (let [error (mbml.errors/format-frontmatter-error :missing-markers "content" nil)]
      (let [data (ex-data error)]
        (is (nil? (get-in data [:data :file-extension])))
        (is (nil? (:file data)))
        (is (some #(re-find #"METABASE_BEGIN.*METABASE_END" %) (:suggestions data))))))

  (testing "format-frontmatter-error for unknown error types"
    (let [error (mbml.errors/format-frontmatter-error :unknown-error "content" "file.txt")]
      (let [suggestions (:suggestions (ex-data error))]
        (is (= 1 (count suggestions)))
        (is (re-find #"Check front-matter formatting" (first suggestions)))))))

;;; ---------------------------------------- File System Error Tests ----------------------------------------

(deftest format-file-error-test
  (testing "format-file-error for file not found"
    (let [cause (Exception. "File does not exist")
          error (mbml.errors/format-file-error :file-not-found "missing.yaml" cause)]

      (is (instance? clojure.lang.ExceptionInfo error))
      (is (= cause (.getCause error)))

      (let [data (ex-data error)]
        (is (= :file-not-found (:type data)))
        (is (= "missing.yaml" (:file data)))
        (is (some #(re-find #"file path.*correct" %) (:suggestions data)))
        (is (some #(re-find #"permission.*access" %) (:suggestions data))))))

  (testing "format-file-error for permission denied"
    (let [cause (Exception. "Access denied")
          error (mbml.errors/format-file-error :permission-denied "secure.yaml" cause)]

      (let [data (ex-data error)]
        (is (= :permission-denied (:type data)))
        (is (= "secure.yaml" (:file data)))
        (is (some #(re-find #"file permissions.*readable" %) (:suggestions data)))
        (is (some #(re-find #"parent directory" %) (:suggestions data))))))

  (testing "format-file-error for I/O errors"
    (let [cause (Exception. "Disk full")
          error (mbml.errors/format-file-error :io-error "data.yaml" cause)]

      (let [data (ex-data error)]
        (is (= :io-error (:type data)))
        (is (some #(re-find #"locked.*another process" %) (:suggestions data)))
        (is (some #(re-find #"disk space.*resources" %) (:suggestions data))))))

  (testing "format-file-error for unknown error types"
    (let [error (mbml.errors/format-file-error :unknown-error "file.txt" (Exception. "Unknown"))]
      (let [suggestions (:suggestions (ex-data error))]
        (is (= 1 (count suggestions)))
        (is (re-find #"file accessibility.*permissions" (first suggestions))))))

  (testing "format-file-error message includes error type description"
    (let [error (mbml.errors/format-file-error :file-not-found "test.yaml" (Exception.))]
      (is (re-find #"File not found.*test\.yaml" (.getMessage error))))))

;;; ------------------------------------- Unsupported File Error Tests ------------------------------------

(deftest format-unsupported-file-error-test
  (testing "format-unsupported-file-error basic functionality"
    (let [error (mbml.errors/format-unsupported-file-error "document.txt")
          data (ex-data error)]
      (is (= :unsupported-format (:type data)))
      (is (= "document.txt" (:file data)))
      (is (some #(re-find #"\.yaml.*\.yml" %) (:suggestions data)))
      (is (some #(re-find #"\.sql.*SQL.*front-matter" %) (:suggestions data)))
      (is (some #(re-find #"\.py.*Python.*front-matter" %) (:suggestions data)))))

  (testing "format-unsupported-file-error message format"
    (let [error (mbml.errors/format-unsupported-file-error "bad.exe")]
      (is (re-find #"Unsupported file format.*bad\.exe" (.getMessage error)))))

  (testing "format-unsupported-file-error with nil detected type"
    (let [error (mbml.errors/format-unsupported-file-error "unknown")
          data (ex-data error)]
      (is (= "unknown" (:file data))))))

;;; -------------------------------------- Internationalization Tests ------------------------------------

(deftest internationalization-test
  (testing "error messages use deferred-tru"
    ; Test that error type definitions use deferred-tru
    (is (every? i18n/localized-string? (vals mbml.errors/error-types))))

  (testing "error functions produce localized strings"
    (let [error (mbml.errors/format-file-error :file-not-found "test.yaml" (Exception.))]
      ; Message should be a string (deferred-tru gets resolved)
      (is (string? (.getMessage error))))

    (let [error (mbml.errors/format-yaml-error "bad yaml" (Exception.) "file.yaml")]
      (is (string? (.getMessage error))))

    (let [error (mbml.errors/format-frontmatter-error :missing-markers "content" "file.sql")]
      (is (string? (.getMessage error)))))

  (testing "suggestions are localized"
    (let [error (mbml.errors/format-schema-validation-error {:errors []} {} "file.yaml")
          suggestions (:suggestions (ex-data error))]
      (is (every? string? suggestions))
      (is (every? #(> (count %) 0) suggestions))))

  (testing "context messages are localized"
    (let [error (mbml.errors/format-yaml-error
                 (str/join "\n" (repeat 20 "line"))
                 (Exception.)
                 "large.yaml")
          context (:context (ex-data error))]
      (is (string? context))
      (is (> (count context) 0)))))

;;; ---------------------------------------- Error Types Tests ----------------------------------------

(deftest error-types-test
  (testing "error-types map contains expected keys"
    (let [expected-types #{:file-not-found :unsupported-format :yaml-parse-error
                           :schema-validation :frontmatter-error :io-error}]
      (is (= expected-types (set (keys mbml.errors/error-types))))))

  (testing "error-types values are localized strings"
    (doseq [[type desc] mbml.errors/error-types]
      (is (keyword? type))
      (is (i18n/localized-string? desc))))

  (testing "error-types can be resolved to strings"
    (doseq [[_ desc] mbml.errors/error-types]
      (is (string? (str desc)))
      (is (> (count (str desc)) 0)))))
