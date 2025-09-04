(ns metabase-enterprise.mbml.errors-test
  "Comprehensive unit tests for MBML error handling utilities.

  Tests all error formatting functions with inline test data, edge cases,
  and validation of internationalized error messages."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest ^:parallel is testing]]
   [metabase-enterprise.mbml.errors :as mbml.errors]
   [metabase.util.i18n :as i18n]))

;;; ------------------------------------------ Error Context Tests ------------------------------------------

(deftest ^:parallel error-context-test
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
      (is (= "Test error message" (ex-message error)))
      (is (=? {:type :yaml-parse-error
               :message "Test error message"
               :file "test.yaml"
               :line 42
               :data {:key "value"}
               :context "Additional context"
               :suggestions ["Fix this" "Try that"]
               :timestamp some?}
              (ex-data error)))))

  (testing "error-context handles minimal inputs"
    (let [error (mbml.errors/error-context :file-not-found "File missing")]
      (is (instance? clojure.lang.ExceptionInfo error))
      (is (= "File missing" (ex-message error)))
      (is (=? {:type :file-not-found
               :message "File missing"
               :timestamp some?}
              (ex-data error)))))

  (testing "error-context handles cause exceptions"
    (let [root-cause (Exception. "Root problem")
          error (mbml.errors/error-context
                 :io-error
                 "IO failed"
                 {:cause root-cause
                  :file "data.yaml"})]

      (is (instance? clojure.lang.ExceptionInfo error))
      (is (= root-cause (ex-cause error)))
      (is (=? {:type :io-error
               :file "data.yaml"
               :message "IO failed"
               :timestamp some?}
              (ex-data error))))))

;;; ---------------------------------------- File Context Tests ------------------------------------------

(deftest ^:parallel format-file-context-test
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

(deftest ^:parallel format-yaml-error-test
  (testing "format-yaml-error with file context"
    (let [yaml-content "invalid: yaml: content:\n  - missing\n    quote"
          cause (Exception. "YAML parsing failed")
          error (mbml.errors/format-yaml-error yaml-content cause "test.yaml")]

      (is (instance? clojure.lang.ExceptionInfo error))
      (is (= cause (ex-cause error)))
      (is (=? {:type :yaml-parse-error
               :file "test.yaml"
               :data {:yaml-content yaml-content
                      :line-count 3}
               :suggestions vector?
               :message string?
               :timestamp some?}
              (ex-data error)))
      (is (some #(re-find #"indentation" %) (:suggestions (ex-data error))))))

  (testing "format-yaml-error without file context"
    (let [yaml-content "bad:\nyaml"
          cause (Exception. "Parse error")
          error (mbml.errors/format-yaml-error yaml-content cause)]

      (is (=? {:type :yaml-parse-error
               :file nil
               :data {:yaml-content yaml-content
                      :line-count 2}
               :message string?
               :timestamp some?}
              (ex-data error)))))

  (testing "format-yaml-error with empty content"
    (let [error (mbml.errors/format-yaml-error "" (Exception. "Empty"))]
      (is (=? {:data {:yaml-content ""
                      :line-count 1}}
              (ex-data error)))))

  (testing "format-yaml-error with large content provides context"
    (let [large-yaml (str/join "\n" (repeat 50 "line: value"))
          error (mbml.errors/format-yaml-error large-yaml (Exception. "Large file error"))]
      (is (=? {:data {:line-count 50}
               :context #".*50 lines.*"
               :type :yaml-parse-error}
              (ex-data error))))))

;;; ------------------------------------- Schema Validation Error Tests -------------------------------------

(deftest ^:parallel format-schema-validation-error-test
  (testing "format-schema-validation-error with file context"
    (let [mock-exception (ex-info "Validation failed"
                                  {:error {:errors [{:path [:name] :message "missing required field"}
                                                    {:path [:entity] :message "invalid entity type"}]}})
          invalid-data {:entity "invalid" :database "test"}
          error (mbml.errors/format-schema-validation-error mock-exception invalid-data "transform.yaml")]

      (is (instance? clojure.lang.ExceptionInfo error))
      (is (=? {:type :schema-validation
               :file "transform.yaml"
               :data {:failed-data invalid-data
                      :errors [{:path [:name] :message "missing required field"}
                               {:path [:entity] :message "invalid entity type"}]}
               :suggestions vector?
               :message string?
               :timestamp some?}
              (ex-data error)))
      (is (some #(re-find #"required fields" %) (:suggestions (ex-data error))))))

  (testing "format-schema-validation-error without file context"
    (let [mock-exception (ex-info "Validation failed"
                                  {:error {:errors [{:path [:identifier] :message "blank identifier"}]}})
          invalid-data {:name "test"}
          error (mbml.errors/format-schema-validation-error mock-exception invalid-data)]

      (is (=? {:type :schema-validation
               :file nil
               :data {:failed-data invalid-data
                      :errors [{:path [:identifier] :message "blank identifier"}]}
               :message string?
               :timestamp some?}
              (ex-data error)))))

  (testing "format-schema-validation-error suggestions are comprehensive"
    (let [mock-exception (ex-info "Validation failed" {:error {:errors []}})
          error (mbml.errors/format-schema-validation-error mock-exception {})
          suggestions (:suggestions (ex-data error))]
      (is (>= (count suggestions) 3))
      (is (some #(re-find #"entity.*identifier.*database.*target" %) suggestions))
      (is (some #(re-find #"Transform:v1" %) suggestions)))))

;;; --------------------------------------- Front-matter Error Tests ---------------------------------------

(deftest ^:parallel format-frontmatter-error-test
  (testing "format-frontmatter-error for missing markers"
    (let [content "SELECT * FROM table -- no METABASE markers"
          error (mbml.errors/format-frontmatter-error :missing-markers content "query.sql")]

      (is (=? {:type :frontmatter-error
               :file "query.sql"
               :data {:error-type :missing-markers
                      :content-length (count content)
                      :file-extension "sql"}
               :suggestions vector?
               :message string?
               :timestamp some?}
              (ex-data error)))
      (is (some #(re-find #"METABASE_BEGIN.*METABASE_END" %) (:suggestions (ex-data error))))
      (is (some #(re-find #"-- METABASE_BEGIN" %) (:suggestions (ex-data error))))))

  (testing "format-frontmatter-error without file extension"
    (let [error (mbml.errors/format-frontmatter-error :missing-markers "content" nil)]
      (is (=? {:data {:file-extension nil}
               :file nil
               :suggestions vector?}
              (ex-data error)))
      (is (some #(re-find #"METABASE_BEGIN.*METABASE_END" %) (:suggestions (ex-data error)))))))

;;; ---------------------------------------- File System Error Tests ----------------------------------------

(deftest ^:parallel format-file-error-test
  (testing "format-file-error for file not found"
    (let [cause (Exception. "File does not exist")
          error (mbml.errors/format-file-error :file-not-found "missing.yaml" cause)]

      (is (instance? clojure.lang.ExceptionInfo error))
      (is (= cause (.getCause error)))
      (is (=? {:type :file-not-found
               :file "missing.yaml"
               :suggestions vector?
               :message string?
               :timestamp some?}
              (ex-data error)))
      (is (some #(re-find #"file path.*correct" %) (:suggestions (ex-data error))))
      (is (some #(re-find #"permission.*access" %) (:suggestions (ex-data error))))))

  (testing "format-file-error for permission denied"
    (let [cause (Exception. "Access denied")
          error (mbml.errors/format-file-error :permission-denied "secure.yaml" cause)]

      (is (=? {:type :permission-denied
               :file "secure.yaml"
               :suggestions vector?}
              (ex-data error)))
      (is (some #(re-find #"file permissions.*readable" %) (:suggestions (ex-data error))))
      (is (some #(re-find #"parent directory" %) (:suggestions (ex-data error))))))

  (testing "format-file-error for I/O errors"
    (let [cause (Exception. "Disk full")
          error (mbml.errors/format-file-error :io-error "data.yaml" cause)]

      (is (=? {:type :io-error
               :suggestions vector?}
              (ex-data error)))
      (is (some #(re-find #"locked.*another process" %) (:suggestions (ex-data error))))
      (is (some #(re-find #"disk space.*resources" %) (:suggestions (ex-data error))))))

  (testing "format-file-error for unknown error types"
    (let [error (mbml.errors/format-file-error :unknown-error "file.txt" (Exception. "Unknown"))
          suggestions (:suggestions (ex-data error))]
      (is (= 1 (count suggestions)))
      (is (re-find #"file accessibility.*permissions" (first suggestions)))))

  (testing "format-file-error message includes error type description"
    (let [error (mbml.errors/format-file-error :file-not-found "test.yaml" (Exception.))]
      (is (re-find #"File not found.*test\.yaml" (.getMessage error))))))

;;; ------------------------------------- Unsupported File Error Tests ------------------------------------

(deftest ^:parallel format-unsupported-file-error-test
  (testing "format-unsupported-file-error basic functionality"
    (let [error (mbml.errors/format-unsupported-file-error "document.txt")]
      (is (=? {:type :unsupported-format
               :file "document.txt"
               :suggestions vector?
               :message string?
               :timestamp some?}
              (ex-data error)))
      (is (some #(re-find #"\.yaml.*\.yml" %) (:suggestions (ex-data error))))
      (is (some #(re-find #"\.sql.*SQL.*front-matter" %) (:suggestions (ex-data error))))
      (is (some #(re-find #"\.py.*Python.*front-matter" %) (:suggestions (ex-data error))))))

  (testing "format-unsupported-file-error message format"
    (let [error (mbml.errors/format-unsupported-file-error "bad.exe")]
      (is (re-find #"Unsupported file format.*bad\.exe" (.getMessage error)))))

  (testing "format-unsupported-file-error with various file types"
    (let [error (mbml.errors/format-unsupported-file-error "unknown")]
      (is (=? {:file "unknown"
               :type :unsupported-format}
              (ex-data error))))))

;;; -------------------------------------- Internationalization Tests ------------------------------------

(deftest ^:parallel internationalization-test
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
    (let [error (mbml.errors/format-schema-validation-error (ex-info "test message" {:error {}}) "file.yaml")
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

(deftest ^:parallel error-types-test
  (testing "error-types map contains expected keys"
    (let [expected-types #{:file-not-found
                           :unsupported-format
                           :yaml-parse-error
                           :empty-file-error
                           :schema-validation
                           :frontmatter-error
                           :io-error}]
      (is (= expected-types (set (keys mbml.errors/error-types))))))

  (testing "error-types values are localized strings"
    (doseq [[type desc] mbml.errors/error-types]
      (is (keyword? type))
      (is (i18n/localized-string? desc))))

  (testing "error-types can be resolved to strings"
    (doseq [[_ desc] mbml.errors/error-types]
      (is (string? (str desc)))
      (is (> (count (str desc)) 0)))))
