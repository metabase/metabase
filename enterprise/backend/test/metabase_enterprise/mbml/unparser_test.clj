(ns metabase-enterprise.mbml.unparser-test
  "Comprehensive unit tests for MBML unparser functionality.

  Tests all content generation formats including YAML generation, front-matter
  generation for SQL and Python files, and the main generate-content function
  with various entity configurations and edge cases."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.mbml.core :as mbml.core]
   [metabase-enterprise.mbml.unparser :as unparser]))

(def valid-transform-entity
  "A valid Transform:v1 entity for testing"
  {:entity "model/Transform:v1"
   :identifier "test_transform"
   :name "Test Transform"
   :database "test_database"
   :target {:type "table" :name "output_table"}
   :description "A test transform for unit testing"
   :body "SELECT id, name FROM users WHERE active = true;"})

(def minimal-transform-entity
  "A minimal valid Transform:v1 entity without optional fields"
  {:entity "model/Transform:v1"
   :identifier "minimal_transform"
   :name "Minimal Transform"
   :database "test_db"
   :target {:type "table" :name "minimal_output"}})

(def transform-with-schema
  "A Transform entity with target schema for testing optional fields"
  {:entity "model/Transform:v1"
   :identifier "schema_transform"
   :name "Schema Transform"
   :database "analytics_db"
   :target {:type "table" :schema "analytics" :name "user_metrics"}
   :description "Transform with schema specification"
   :tags ["analytics" "hourly"]
   :body "SELECT user_id, COUNT(*) as metric_count FROM events GROUP BY user_id;"})

(def transform-with-unicode
  "A Transform entity with Unicode characters for testing character encoding"
  {:entity "model/Transform:v1"
   :identifier "unicode_transform"
   :name "Unicöde Tränsfœrm 🚀"
   :database "test_db"
   :target {:type "table" :name "unicode_table"}
   :description "Testing Unicode: 中文 日本語 العربية ρμσικá"
   :tags ["unicode" "test"]
   :body "SELECT '测试' as chinese, 'тест' as russian, 'πρόβλημα' as greek;"})

(def transform-with-special-chars
  "A Transform entity with special characters in various fields"
  {:entity "model/Transform:v1"
   :identifier "special_chars_transform"
   :name "Special & \"Quotes\" 'Chars'"
   :database "test_db"
   :target {:type "table" :name "special_output"}
   :description "Contains: quotes, backslashes\\, and special chars: @#$%^&*()"
   :body "SELECT 'It\\'s working!' as test, \"Double quotes\" as another;"})

(def python-transform-entity
  "A Transform entity with Python code body"
  {:entity "model/Transform:v1"
   :identifier "python_transform"
   :name "Python Transform"
   :database "analytics_db"
   :target {:type "table" :name "python_output"}
   :description "A transform using Python"
   :body "import pandas as pd\nimport numpy as np\n\ndf = pd.read_sql('SELECT * FROM source', connection)\nresult = df.groupby('category').agg({'value': 'mean'})\nresult.to_sql('python_output', connection, if_exists='replace')"})

(def empty-body-transform
  "A Transform entity with empty body content"
  {:entity "model/Transform:v1"
   :identifier "empty_body_transform"
   :name "Empty Body Transform"
   :database "test_db"
   :target {:type "table" :name "empty_output"}
   :body ""})

(def no-body-transform
  "A Transform entity without a body field"
  {:entity "model/Transform:v1"
   :identifier "no_body_transform"
   :name "No Body Transform"
   :database "test_db"
   :target {:type "table" :name "no_body_output"}})

(deftest generate-yaml-test
  (testing "generate-yaml function"
    (testing "generates valid YAML from complete entity"
      (let [result (unparser/generate-yaml valid-transform-entity)]
        (is (string? result))
        (is (str/includes? result "entity: model/Transform:v1"))
        (is (str/includes? result "identifier: test_transform"))
        (is (str/includes? result "name: Test Transform"))
        (is (str/includes? result "database: test_database"))
        (is (str/includes? result "target: {type: table, name: output_table}"))
        (is (str/includes? result "description: A test transform for unit testing"))
        ;; :body should be excluded from YAML output
        (is (not (str/includes? result "body:")))))

    (testing "generates valid YAML from minimal entity"
      (let [result (unparser/generate-yaml minimal-transform-entity)]
        (is (string? result))
        (is (str/includes? result "entity: model/Transform:v1"))
        (is (str/includes? result "identifier: minimal_transform"))
        (is (str/includes? result "name: Minimal Transform"))
        (is (not (str/includes? result "description:")))))

    (testing "removes :body key before validation"
      (let [entity-with-body (assoc minimal-transform-entity :body "SELECT * FROM test;")
            result (unparser/generate-yaml entity-with-body)]
        (is (string? result))
        (is (not (str/includes? result "body:")))))))

(deftest generate-frontmatter-test
  (testing "generate-frontmatter function"
    (let [sample-yaml "entity: model/Transform:v1\nname: Test Transform\ndatabase: test_db"]

      (testing "generates SQL front-matter correctly"
        (let [result (unparser/generate-frontmatter sample-yaml :sql)
              lines (str/split-lines result)]
          (is (= "-- METABASE_BEGIN" (first lines)))
          (is (= "-- METABASE_END" (last lines)))
          (is (every? #(str/starts-with? % "--") (butlast (rest lines))))
          (is (str/includes? result "-- entity: model/Transform:v1"))
          (is (str/includes? result "-- name: Test Transform"))))

      (testing "generates Python front-matter correctly"
        (let [result (unparser/generate-frontmatter sample-yaml :python)
              lines (str/split-lines result)]
          (is (= "# METABASE_BEGIN" (first lines)))
          (is (= "# METABASE_END" (last lines)))
          (is (every? #(str/starts-with? % "#") (butlast (rest lines))))
          (is (str/includes? result "# entity: model/Transform:v1"))
          (is (str/includes? result "# name: Test Transform")))))))

(deftest generate-content-test
  (testing "generate-content function"

    (testing "YAML format"
      (testing "returns pure YAML for :yaml format"
        (let [result (unparser/generate-content valid-transform-entity :yaml)]
          (is (string? result))
          (is (str/includes? result "entity: model/Transform:v1"))
          (is (not (str/includes? result "METABASE_BEGIN")))
          (is (not (str/includes? result "body:")))))

      (testing "works with minimal entity"
        (let [result (unparser/generate-content minimal-transform-entity :yaml)]
          (is (string? result))
          (is (str/includes? result "entity: model/Transform:v1")))))

    (testing "SQL format"
      (testing "generates front-matter with body"
        (let [result (unparser/generate-content valid-transform-entity :sql)]
          (is (string? result))
          (is (str/includes? result "-- METABASE_BEGIN"))
          (is (str/includes? result "-- METABASE_END"))
          (is (str/includes? result "-- entity: model/Transform:v1"))
          (is (str/includes? result "SELECT id, name FROM users WHERE active = true;"))
          ;; Check proper spacing between front-matter and body
          (is (str/includes? result "-- METABASE_END\n\nSELECT"))))

      (testing "generates only front-matter when no body"
        (let [result (unparser/generate-content minimal-transform-entity :sql)]
          (is (string? result))
          (is (str/includes? result "-- METABASE_BEGIN"))
          (is (str/includes? result "-- METABASE_END"))
          (is (str/includes? result "-- entity: model/Transform:v1"))
          (is (not (str/includes? result "SELECT"))))))

    (testing "Python format"
      (testing "generates front-matter with body"
        (let [python-entity (assoc valid-transform-entity
                                   :body "import pandas as pd\n\ndef process():\n    return pd.DataFrame()")
              result (unparser/generate-content python-entity :python)]
          (is (string? result))
          (is (str/includes? result "# METABASE_BEGIN"))
          (is (str/includes? result "# METABASE_END"))
          (is (str/includes? result "# entity: model/Transform:v1"))
          (is (str/includes? result "import pandas as pd"))
          ;; Check proper spacing between front-matter and body
          (is (str/includes? result "# METABASE_END\n\nimport"))))

      (testing "generates only front-matter when no body"
        (let [result (unparser/generate-content minimal-transform-entity :python)]
          (is (string? result))
          (is (str/includes? result "# METABASE_BEGIN"))
          (is (str/includes? result "# METABASE_END"))
          (is (str/includes? result "# entity: model/Transform:v1"))
          (is (not (str/includes? result "import"))))))

    (testing "schema validation"
      (testing "validates entity schema"
        ;; This should work - valid entity
        (is (string? (unparser/generate-content valid-transform-entity :yaml))))

      (testing "validates output format"
        ;; Invalid format should throw schema validation error
        (is (thrown? Exception
                     (unparser/generate-content valid-transform-entity :invalid-format)))))))

(deftest generate-content-edge-cases-test
  (testing "generate-content edge cases"

    (testing "handles empty body correctly"
      (let [entity-with-empty-body (assoc minimal-transform-entity :body "")
            result (unparser/generate-content entity-with-empty-body :sql)]
        (is (string? result))
        (is (str/includes? result "-- METABASE_END\n\n"))))

    (testing "handles multiline body content"
      (let [multiline-body "SELECT\n  id,\n  name,\n  created_at\nFROM users\nWHERE active = true;"
            entity-with-multiline (assoc minimal-transform-entity :body multiline-body)
            result (unparser/generate-content entity-with-multiline :sql)]
        (is (string? result))
        (is (str/includes? result multiline-body))
        (is (str/includes? result "-- METABASE_END\n\nSELECT"))))

    (testing "handles entity with target schema"
      (let [entity-with-schema (assoc minimal-transform-entity
                                      :target {:type "table" :schema "analytics" :name "processed_data"})
            result (unparser/generate-content entity-with-schema :yaml)]
        (is (string? result))
        (is (str/includes? result "schema: analytics"))))

    (testing "handles entity with tags"
      (let [entity-with-tags (assoc minimal-transform-entity :tags ["analytics" "daily"])
            result (unparser/generate-content entity-with-tags :yaml)]
        (is (string? result))
        (is (str/includes? result "tags:"))))))

(deftest detect-format-from-extension-test
  (testing "detect-format-from-extension function"

    (testing "detects YAML formats correctly"
      (is (= :yaml (unparser/detect-format-from-extension "model.yaml")))
      (is (= :yaml (unparser/detect-format-from-extension "transform.yml")))
      (is (= :yaml (unparser/detect-format-from-extension "/path/to/file.YAML")))
      (is (= :yaml (unparser/detect-format-from-extension "/path/to/file.YML"))))

    (testing "detects SQL format correctly"
      (is (= :sql (unparser/detect-format-from-extension "transform.sql")))
      (is (= :sql (unparser/detect-format-from-extension "/path/to/query.SQL"))))

    (testing "detects Python format correctly"
      (is (= :python (unparser/detect-format-from-extension "script.py")))
      (is (= :python (unparser/detect-format-from-extension "/path/to/script.PY"))))

    (testing "returns nil for unknown extensions"
      (is (nil? (unparser/detect-format-from-extension "readme.txt")))
      (is (nil? (unparser/detect-format-from-extension "data.json")))
      (is (nil? (unparser/detect-format-from-extension "script.js"))))

    (testing "handles edge cases"
      (is (nil? (unparser/detect-format-from-extension "")))
      (is (nil? (unparser/detect-format-from-extension "no-extension")))
      (is (nil? (unparser/detect-format-from-extension ".hidden"))))))

(deftest unparse-mbml-to-string-test
  (testing "unparse-mbml-to-string function"

    (testing "generates YAML format correctly"
      (let [result (unparser/unparse-mbml-to-string valid-transform-entity :yaml)]
        (is (string? result))
        (is (str/includes? result "entity: model/Transform:v1"))
        (is (str/includes? result "name: Test Transform"))
        (is (not (str/includes? result "body:")))
        (is (not (str/includes? result "METABASE_BEGIN")))))

    (testing "generates SQL format correctly"
      (let [result (unparser/unparse-mbml-to-string valid-transform-entity :sql)]
        (is (string? result))
        (is (str/includes? result "-- METABASE_BEGIN"))
        (is (str/includes? result "-- METABASE_END"))
        (is (str/includes? result "-- entity: model/Transform:v1"))
        (is (str/includes? result "SELECT id, name FROM users WHERE active = true;"))
        ;; Verify proper spacing
        (is (str/includes? result "-- METABASE_END\n\nSELECT"))))

    (testing "generates Python format correctly"
      (let [result (unparser/unparse-mbml-to-string python-transform-entity :python)]
        (is (string? result))
        (is (str/includes? result "# METABASE_BEGIN"))
        (is (str/includes? result "# METABASE_END"))
        (is (str/includes? result "# entity: model/Transform:v1"))
        (is (str/includes? result "import pandas as pd"))
        ;; Verify proper spacing
        (is (str/includes? result "# METABASE_END\n\nimport"))))

    (testing "handles entities without body"
      (let [result (unparser/unparse-mbml-to-string no-body-transform :sql)]
        (is (string? result))
        (is (str/includes? result "-- METABASE_BEGIN"))
        (is (str/includes? result "-- METABASE_END"))
        (is (not (str/includes? result "SELECT")))))

    (testing "handles entities with empty body"
      (let [result (unparser/unparse-mbml-to-string empty-body-transform :sql)]
        (is (string? result))
        (is (str/includes? result "-- METABASE_BEGIN"))
        (is (str/includes? result "-- METABASE_END\n\n"))))

    (testing "handles Unicode characters correctly"
      (let [result (unparser/unparse-mbml-to-string transform-with-unicode :yaml)]
        (is (string? result))
        (is (str/includes? result "Unicöde Tränsfœrm 🚀"))
        (is (str/includes? result "中文 日本語 العربية"))))

    (testing "handles special characters correctly"
      (let [result (unparser/unparse-mbml-to-string transform-with-special-chars :yaml)]
        (is (string? result))
        (is (str/includes? result "Special & \"Quotes\" 'Chars'"))
        (is (str/includes? result "backslashes\\"))))

    (testing "validates schema and throws on invalid entity"
      (let [invalid-entity {:entity "invalid" :name "test"}]
        (is (thrown? Exception
                     (unparser/unparse-mbml-to-string invalid-entity :yaml)))))

    (testing "validates format and throws on invalid format"
      (is (thrown? Exception
                   (unparser/unparse-mbml-to-string valid-transform-entity :invalid))))))

(deftest unparse-mbml-to-file-test
  (testing "unparse-mbml-to-file function"
    (let [temp-dir (java.nio.file.Files/createTempDirectory "unparser-test" (into-array java.nio.file.attribute.FileAttribute []))]

      (testing "writes YAML file correctly"
        (let [yaml-file (.resolve temp-dir "test.yaml")
              yaml-path (.toString yaml-file)
              result (unparser/unparse-mbml-to-file valid-transform-entity :yaml yaml-path)]
          (is (= yaml-path result))
          (is (.exists (io/file yaml-path)))
          (let [content (slurp yaml-path)]
            (is (str/includes? content "entity: model/Transform:v1"))
            (is (str/includes? content "name: Test Transform"))
            (is (not (str/includes? content "body:"))))))

      (testing "writes SQL file correctly"
        (let [sql-file (.resolve temp-dir "test.sql")
              sql-path (.toString sql-file)
              result (unparser/unparse-mbml-to-file valid-transform-entity :sql sql-path)]
          (is (= sql-path result))
          (is (.exists (io/file sql-path)))
          (let [content (slurp sql-path)]
            (is (str/includes? content "-- METABASE_BEGIN"))
            (is (str/includes? content "-- METABASE_END"))
            (is (str/includes? content "SELECT id, name FROM users")))))

      (testing "writes Python file correctly"
        (let [py-file (.resolve temp-dir "test.py")
              py-path (.toString py-file)
              result (unparser/unparse-mbml-to-file python-transform-entity :python py-path)]
          (is (= py-path result))
          (is (.exists (io/file py-path)))
          (let [content (slurp py-path)]
            (is (str/includes? content "# METABASE_BEGIN"))
            (is (str/includes? content "# METABASE_END"))
            (is (str/includes? content "import pandas as pd")))))

      (testing "creates parent directories if they don't exist"
        (let [nested-dir (.resolve temp-dir "deeply/nested/directory")
              nested-file (.resolve nested-dir "test.yaml")
              nested-path (.toString nested-file)
              result (unparser/unparse-mbml-to-file minimal-transform-entity :yaml nested-path)]
          (is (= nested-path result))
          (is (.exists (io/file nested-path)))
          (is (.exists (.toFile nested-dir)))))

      (testing "handles Unicode content in files"
        (let [unicode-file (.resolve temp-dir "unicode.yaml")
              unicode-path (.toString unicode-file)
              result (unparser/unparse-mbml-to-file transform-with-unicode :yaml unicode-path)]
          (is (= unicode-path result))
          (let [content (slurp unicode-path)]
            (is (str/includes? content "Unicöde Tränsfœrm 🚀"))
            (is (str/includes? content "中文 日本語 العربية")))))

      (testing "validates schema before writing"
        (let [invalid-file (.resolve temp-dir "invalid.yaml")
              invalid-path (.toString invalid-file)
              invalid-entity {:entity "invalid" :name "test"}]
          (is (thrown? Exception
                       (unparser/unparse-mbml-to-file invalid-entity :yaml invalid-path)))
          ;; File should not be created on validation failure
          (is (not (.exists (io/file invalid-path))))))

      ;; Clean up temp directory
      (doseq [file (reverse (file-seq (.toFile temp-dir)))]
        (.delete file)))))

(deftest round-trip-test
  (testing "round-trip: unparse then parse should yield original data"

    (testing "YAML round-trip test"
      (let [generated-yaml (unparser/unparse-mbml-to-string valid-transform-entity :yaml)
            parsed-back (mbml.core/parse-mbml-string generated-yaml :yaml)
            ;; Remove :body from original for comparison since YAML format excludes it
            expected (dissoc valid-transform-entity :body)]
        (is (= expected parsed-back))))

    (testing "SQL round-trip test"
      (let [generated-sql (unparser/unparse-mbml-to-string valid-transform-entity :sql)
            parsed-back (mbml.core/parse-mbml-string generated-sql :sql)]
        ;; SQL format should preserve the complete entity including :body
        (is (= valid-transform-entity parsed-back))))

    (testing "Python round-trip test"
      (let [generated-python (unparser/unparse-mbml-to-string python-transform-entity :python)
            parsed-back (mbml.core/parse-mbml-string generated-python :python)]
        ;; Python format should preserve the complete entity including :body
        (is (= python-transform-entity parsed-back))))

    (testing "round-trip with minimal entity"
      (let [generated-yaml (unparser/unparse-mbml-to-string minimal-transform-entity :yaml)
            parsed-back (mbml.core/parse-mbml-string generated-yaml :yaml)]
        ;; Minimal entity has no :body to remove
        (is (= minimal-transform-entity parsed-back))))

    (testing "round-trip with complex entity (schema, tags, description)"
      (let [generated-yaml (unparser/unparse-mbml-to-string transform-with-schema :yaml)
            parsed-back (mbml.core/parse-mbml-string generated-yaml :yaml)
            ;; Remove :body from original for YAML comparison
            expected (dissoc transform-with-schema :body)]
        (is (= expected parsed-back))))

    (testing "round-trip with Unicode content"
      (let [generated-yaml (unparser/unparse-mbml-to-string transform-with-unicode :yaml)
            parsed-back (mbml.core/parse-mbml-string generated-yaml :yaml)
            expected (dissoc transform-with-unicode :body)]
        (is (= expected parsed-back))
        ;; Verify Unicode characters are preserved
        (is (= "Unicöde Tränsfœrm 🚀" (:name parsed-back)))
        (is (str/includes? (:description parsed-back) "中文 日本語 العربية"))))

    (testing "round-trip with special characters"
      (let [generated-yaml (unparser/unparse-mbml-to-string transform-with-special-chars :yaml)
            parsed-back (mbml.core/parse-mbml-string generated-yaml :yaml)
            expected (dissoc transform-with-special-chars :body)]
        (is (= expected parsed-back))
        ;; Verify special characters are preserved
        (is (= "Special & \"Quotes\" 'Chars'" (:name parsed-back)))
        (is (str/includes? (:description parsed-back) "backslashes\\"))))

    (testing "round-trip SQL with empty body"
      (let [generated-sql (unparser/unparse-mbml-to-string empty-body-transform :sql)
            parsed-back (mbml.core/parse-mbml-string generated-sql :sql)]
        (is (= empty-body-transform parsed-back))))

    (testing "round-trip SQL with no body field"
      (let [generated-sql (unparser/unparse-mbml-to-string no-body-transform :sql)
            parsed-back (mbml.core/parse-mbml-string generated-sql :sql)]
        ;; When no body is present, parser adds an empty :body field
        (is (= (assoc no-body-transform :body "") parsed-back))
        (is (contains? parsed-back :body))
        (is (= "" (:body parsed-back)))))))

(deftest round-trip-file-test
  (testing "round-trip file operations: write file then parse file"
    (let [temp-dir (java.nio.file.Files/createTempDirectory "round-trip-test" (into-array java.nio.file.attribute.FileAttribute []))]

      (testing "YAML file round-trip"
        (let [yaml-file (.resolve temp-dir "roundtrip.yaml")
              yaml-path (.toString yaml-file)]
          (unparser/unparse-mbml-to-file valid-transform-entity :yaml yaml-path)
          (let [parsed-back (mbml.core/parse-mbml-file yaml-path)
                expected (dissoc valid-transform-entity :body)]
            (is (= expected parsed-back)))))

      (testing "SQL file round-trip"
        (let [sql-file (.resolve temp-dir "roundtrip.sql")
              sql-path (.toString sql-file)]
          (unparser/unparse-mbml-to-file valid-transform-entity :sql sql-path)
          (let [parsed-back (mbml.core/parse-mbml-file sql-path)]
            (is (= valid-transform-entity parsed-back)))))

      (testing "Python file round-trip"
        (let [py-file (.resolve temp-dir "roundtrip.py")
              py-path (.toString py-file)]
          (unparser/unparse-mbml-to-file python-transform-entity :python py-path)
          (let [parsed-back (mbml.core/parse-mbml-file py-path)]
            (is (= python-transform-entity parsed-back)))))

      (testing "Unicode content file round-trip"
        (let [unicode-file (.resolve temp-dir "unicode-roundtrip.yaml")
              unicode-path (.toString unicode-file)]
          (unparser/unparse-mbml-to-file transform-with-unicode :yaml unicode-path)
          (let [parsed-back (mbml.core/parse-mbml-file unicode-path)
                expected (dissoc transform-with-unicode :body)]
            (is (= expected parsed-back))
            (is (= "Unicöde Tränsfœrm 🚀" (:name parsed-back))))))

      ;; Clean up temp directory
      (doseq [file (reverse (file-seq (.toFile temp-dir)))]
        (.delete file)))))

(deftest comprehensive-edge-cases-test
  (testing "comprehensive edge cases for all functions"

    (testing "multiline content handling"
      (let [multiline-entity (assoc valid-transform-entity
                                    :body "SELECT\n  id,\n  name,\n  email\nFROM users\nWHERE\n  active = true\n  AND created_at > '2023-01-01';")
            sql-result (unparser/unparse-mbml-to-string multiline-entity :sql)
            python-result (unparser/unparse-mbml-to-string
                           (assoc multiline-entity
                                  :body "import pandas as pd\n\ndef process_data():\n    df = pd.read_csv('input.csv')\n    return df.groupby('category').sum()")
                           :python)]
        (is (str/includes? sql-result "SELECT\n  id,"))
        (is (str/includes? sql-result "WHERE\n  active = true"))
        (is (str/includes? python-result "import pandas as pd"))
        (is (str/includes? python-result "def process_data():"))))

    (testing "very long strings"
      (let [long-description (str/join " " (repeat 100 "This is a very long description"))
            long-entity (assoc minimal-transform-entity :description long-description)
            result (unparser/unparse-mbml-to-string long-entity :yaml)]
        (is (string? result))
        (is (str/includes? result long-description))))

    (testing "empty and nil field handling"
      (let [entity-with-empty-desc (assoc minimal-transform-entity :description "")
            result (unparser/unparse-mbml-to-string entity-with-empty-desc :yaml)]
        (is (string? result))
        (is (str/includes? result "description:"))))

    (testing "special YAML characters in content"
      (let [yaml-special-entity (assoc minimal-transform-entity
                                       :name "Name: with [brackets] and {braces}"
                                       :description "Description with: colons, - dashes, and | pipes")
            result (unparser/unparse-mbml-to-string yaml-special-entity :yaml)]
        (is (string? result))
        (is (str/includes? result "with [brackets] and {braces}"))
        (is (str/includes? result "colons, - dashes, and | pipes"))))

    (testing "numeric and boolean-like strings"
      (let [tricky-entity (assoc minimal-transform-entity
                                 :name "Transform 2023"
                                 :description "Status: true, Count: 42, Version: 1.0")
            result (unparser/unparse-mbml-to-string tricky-entity :yaml)]
        (is (string? result))
        (is (str/includes? result "Transform 2023"))
        (is (str/includes? result "Status: true"))))

    (testing "SQL injection-like content in body"
      (let [injection-entity (assoc minimal-transform-entity
                                    :body "SELECT * FROM users; DROP TABLE important_data; --")
            result (unparser/unparse-mbml-to-string injection-entity :sql)]
        (is (string? result))
        (is (str/includes? result "DROP TABLE important_data"))
        ;; Should be properly escaped in the body section
        (is (str/includes? result "-- METABASE_END\n\nSELECT * FROM users; DROP TABLE"))))

    (testing "mixed content with tabs and special whitespace"
      (let [mixed-whitespace-entity (assoc minimal-transform-entity
                                           :body "SELECT\t\tid,\r\n\tname\nFROM\ttable\r\nWHERE active")
            result (unparser/unparse-mbml-to-string mixed-whitespace-entity :sql)]
        (is (string? result))
        ;; Should preserve the original whitespace in body
        (is (str/includes? result "SELECT\t\tid"))))))

(deftest error-handling-and-validation-test
  (testing "comprehensive error handling and validation"

    (testing "schema validation errors"
      ;; Missing required fields
      (is (thrown? Exception
                   (unparser/unparse-mbml-to-string {:entity "model/Transform:v1"} :yaml)))

      ;; Invalid entity type
      (is (thrown? Exception
                   (unparser/unparse-mbml-to-string
                    (assoc minimal-transform-entity :entity "invalid/Type:v1") :yaml)))

      ;; Invalid target structure
      (is (thrown? Exception
                   (unparser/unparse-mbml-to-string
                    (assoc minimal-transform-entity :target {:type "invalid"}) :yaml)))

      ;; Empty required string fields
      (is (thrown? Exception
                   (unparser/unparse-mbml-to-string
                    (assoc minimal-transform-entity :name "") :yaml))))

    (testing "format validation errors"
      (is (thrown? Exception
                   (unparser/unparse-mbml-to-string minimal-transform-entity :invalid-format)))

      (is (thrown? Exception
                   (unparser/unparse-mbml-to-string minimal-transform-entity nil))))

    (testing "file operations error handling"
      (let [temp-dir (java.nio.file.Files/createTempDirectory "error-test" (into-array java.nio.file.attribute.FileAttribute []))]

        (testing "validates entity before attempting file write"
          (let [invalid-file (.resolve temp-dir "invalid.yaml")
                invalid-path (.toString invalid-file)
                invalid-entity {:entity "invalid" :name "test"}]
            (is (thrown? Exception
                         (unparser/unparse-mbml-to-file invalid-entity :yaml invalid-path)))
            ;; File should not exist after validation failure
            (is (not (.exists (io/file invalid-path))))))

        ;; Clean up
        (doseq [file (reverse (file-seq (.toFile temp-dir)))]
          (.delete file))))

    (testing "nil and empty input handling"
      (is (thrown? Exception (unparser/unparse-mbml-to-string nil :yaml)))
      (is (thrown? Exception (unparser/unparse-mbml-to-string {} :yaml))))))

(deftest performance-and-robustness-test
  (testing "performance and robustness with various scenarios"

    (testing "handles entities with many optional fields"
      (let [comprehensive-entity {:entity "model/Transform:v1"
                                  :identifier "comprehensive_transform"
                                  :name "Comprehensive Transform"
                                  :database "test_database"
                                  :target {:type "table" :schema "analytics" :name "comprehensive_output"}
                                  :description "A comprehensive test entity with all possible fields"
                                  :tags ["test" "comprehensive" "analytics" "daily" "important"]
                                  :body "WITH base_data AS (\n  SELECT\n    id,\n    name,\n    category,\n    created_at,\n    updated_at\n  FROM source_table\n  WHERE active = true\n)\nSELECT\n  category,\n  COUNT(*) as count,\n  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_lifetime\nFROM base_data\nGROUP BY category\nORDER BY count DESC;"}]

        (testing "YAML generation with all fields"
          (let [result (unparser/unparse-mbml-to-string comprehensive-entity :yaml)]
            (is (string? result))
            (is (str/includes? result "entity: model/Transform:v1"))
            (is (str/includes? result "schema: analytics"))
            (is (str/includes? result "tags:"))
            (is (str/includes? result "- test"))
            (is (str/includes? result "- comprehensive"))))

        (testing "SQL generation with complex body"
          (let [result (unparser/unparse-mbml-to-string comprehensive-entity :sql)]
            (is (string? result))
            (is (str/includes? result "-- METABASE_BEGIN"))
            (is (str/includes? result "-- METABASE_END"))
            (is (str/includes? result "WITH base_data AS"))
            (is (str/includes? result "GROUP BY category"))))

        (testing "round-trip with comprehensive entity"
          (let [yaml-result (unparser/unparse-mbml-to-string comprehensive-entity :yaml)
                parsed-back (mbml.core/parse-mbml-string yaml-result :yaml)
                expected (dissoc comprehensive-entity :body)]
            (is (= expected parsed-back))))))

    (testing "handles rapid successive operations"
      (dotimes [i 10]
        (let [test-entity (assoc minimal-transform-entity
                                 :identifier (str "rapid_test_" i)
                                 :name (str "Rapid Test " i))
              yaml-result (unparser/unparse-mbml-to-string test-entity :yaml)
              parsed-back (mbml.core/parse-mbml-string yaml-result :yaml)]
          (is (= test-entity parsed-back)))))

    (testing "memory usage with large entities"
      (let [large-body (str/join "\n" (map #(str "SELECT " % " FROM table_" %) (range 1000)))
            large-entity (assoc minimal-transform-entity :body large-body)
            result (unparser/unparse-mbml-to-string large-entity :sql)]
        (is (string? result))
        (is (> (count result) 10000)) ; Should be quite large
        (is (str/includes? result "SELECT 0 FROM table_0"))
        (is (str/includes? result "SELECT 999 FROM table_999"))))))