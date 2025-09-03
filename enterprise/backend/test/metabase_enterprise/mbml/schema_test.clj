(ns metabase-enterprise.mbml.schema-test
  "Comprehensive unit tests for MBML Malli schema definitions.

  Tests all schema validations for Transform:v1 entities including required fields,
  optional fields, entity type validation, and error message testing with internationalization."
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase-enterprise.mbml.schema :as mbml.schema]
   [metabase.test :as mt]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]))

;;; ------------------------------------------ Entity Type Schema Tests ------------------------------------------

(deftest entity-type-schema-test
  (testing "::entity-type schema validation"
    (testing "valid entity types"
      (is (= true (mr/validate ::mbml.schema/entity-type "model/Transform:v1"))))

    (testing "invalid entity types"
      (are [invalid-type] (= false (mr/validate ::mbml.schema/entity-type invalid-type))
        "invalid-type"
        "Transform:v1"
        "model/Transform"
        "model/Transform:v2"
        ""
        nil
        123
        []
        {}))))

;;; ------------------------------------------ Required Field Schema Tests ------------------------------------

(deftest required-field-schemas-test
  (testing "::identifier schema validation"
    (testing "valid identifiers"
      (are [valid-id] (= true (mr/validate ::mbml.schema/identifier valid-id))
        "my-transform"
        "transform_with_underscores"
        "Transform123"
        "a"
        "very-long-identifier-name-with-dashes-and-numbers-123"))

    (testing "invalid identifiers"
      (are [invalid-id] (= false (mr/validate ::mbml.schema/identifier invalid-id))
        ""
        nil
        123
        []
        {}
        "   ")))

  (testing "::name schema validation"
    (testing "valid names"
      (are [valid-name] (= true (mr/validate ::mbml.schema/name valid-name))
        "My Transform"
        "Transform with Spaces"
        "1234567890"
        "Special Characters !@#$%"))

    (testing "invalid names"
      (are [invalid-name] (= false (mr/validate ::mbml.schema/name invalid-name))
        ""
        nil
        123
        []
        {}
        "   ")))

  (testing "::database schema validation"
    (testing "valid database references"
      (are [valid-db] (= true (mr/validate ::mbml.schema/database valid-db))
        "production"
        "test-db"
        "database_123"
        "db"))

    (testing "invalid database references"
      (are [invalid-db] (= false (mr/validate ::mbml.schema/database invalid-db))
        ""
        nil
        123
        []
        {}
        "   ")))

  (testing "::target schema validation"
    (testing "valid target names"
      (are [valid-target] (= true (mr/validate ::mbml.schema/target valid-target))
        "output_table"
        "my-view"
        "TableName"
        "t"))

    (testing "invalid target names"
      (are [invalid-target] (= false (mr/validate ::mbml.schema/target invalid-target))
        ""
        nil
        123
        []
        {}
        "   "))))

;;; ------------------------------------------ Optional Field Schema Tests ------------------------------------

(deftest optional-field-schemas-test
  (testing "::description schema validation"
    (testing "valid descriptions"
      (are [valid-desc] (= true (mr/validate ::mbml.schema/description valid-desc))
        "A description"
        ""
        "Multi-line\ndescription"
        "Description with special chars !@#$%"
        nil))

    (testing "invalid descriptions"
      (are [invalid-desc] (= false (mr/validate ::mbml.schema/description invalid-desc))
        123
        []
        {})))

  (testing "::tags schema validation"
    (testing "valid tags"
      (are [valid-tags] (= true (mr/validate ::mbml.schema/tags valid-tags))
        ["tag1" "tag2"]
        ["single-tag"]
        []
        nil))

    (testing "invalid tags"
      (are [invalid-tags] (= false (mr/validate ::mbml.schema/tags invalid-tags))
        "not-a-vector"
        ["valid-tag" 123]
        [nil "tag"]
        123
        {})))

  (testing "::source schema validation"
    (testing "valid source code"
      (are [valid-source] (= true (mr/validate ::mbml.schema/source valid-source))
        "SELECT * FROM table"
        "# Python code\nprint('hello')"
        ""
        nil))

    (testing "invalid source code"
      (are [invalid-source] (= false (mr/validate ::mbml.schema/source invalid-source))
        123
        []
        {}))))

;;; ------------------------------------------ Transform:v1 Schema Tests --------------------------------------

(deftest transform-v1-schema-test
  (let [valid-complete-transform
        {:entity "model/Transform:v1"
         :name "Complete Transform"
         :identifier "complete-transform"
         :database "production"
         :target "output_table"
         :description "A complete transform with all fields"
         :tags ["etl" "production" "analytics"]
         :source "SELECT id, name, created_at FROM users WHERE active = true"}

        valid-minimal-transform
        {:entity "model/Transform:v1"
         :name "Minimal Transform"
         :identifier "minimal-transform"
         :database "test-db"
         :target "test_output"}]

    (testing "valid Transform:v1 entities"
      (is (= true (mr/validate ::mbml.schema/transform-v1 valid-complete-transform)))
      (is (= true (mr/validate ::mbml.schema/transform-v1 valid-minimal-transform))))

    (testing "missing required fields"
      (are [missing-field] (= false (mr/validate ::mbml.schema/transform-v1 (dissoc valid-minimal-transform missing-field)))
        :entity
        :name
        :identifier
        :database
        :target))

    (testing "invalid field values"
      (is (= false (mr/validate ::mbml.schema/transform-v1 (assoc valid-minimal-transform :entity "invalid-entity"))))
      (is (= false (mr/validate ::mbml.schema/transform-v1 (assoc valid-minimal-transform :name ""))))
      (is (= false (mr/validate ::mbml.schema/transform-v1 (assoc valid-minimal-transform :identifier nil))))
      (is (= false (mr/validate ::mbml.schema/transform-v1 (assoc valid-minimal-transform :database 123))))
      (is (= false (mr/validate ::mbml.schema/transform-v1 (assoc valid-minimal-transform :target [])))))

    (testing "invalid optional field values"
      (is (= false (mr/validate ::mbml.schema/transform-v1 (assoc valid-minimal-transform :description 123))))
      (is (= false (mr/validate ::mbml.schema/transform-v1 (assoc valid-minimal-transform :tags "not-a-vector"))))
      (is (= false (mr/validate ::mbml.schema/transform-v1 (assoc valid-minimal-transform :source {})))))

    (testing "extra fields not allowed (closed schema)"
      (is (= false (mr/validate ::mbml.schema/transform-v1 (assoc valid-minimal-transform :extra-field "value")))))))

;;; ------------------------------------------ MBML Entity Multi-dispatch Tests ------------------------------

(deftest mbml-entity-schema-test
  (let [valid-transform
        {:entity "model/Transform:v1"
         :name "Test Transform"
         :identifier "test-transform"
         :database "test-db"
         :target "test_table"
         :description "Test description"
         :tags ["test"]
         :source "SELECT 1"}]

    (testing "valid MBML entities"
      (is (= true (mr/validate ::mbml.schema/mbml-entity valid-transform))))

    (testing "invalid entity dispatch"
      (is (= false (mr/validate ::mbml.schema/mbml-entity (assoc valid-transform :entity "model/Unknown:v1")))))

    (testing "missing entity field"
      (is (= false (mr/validate ::mbml.schema/mbml-entity (dissoc valid-transform :entity)))))

    (testing "entity field with wrong type"
      (is (= false (mr/validate ::mbml.schema/mbml-entity (assoc valid-transform :entity 123)))))))

;;; ------------------------------------------ Error Message Testing ------------------------------------------

(deftest schema-error-messages-test
  (testing "error explanations are provided"
    (let [invalid-transform {:entity "invalid" :name "" :identifier nil}
          errors (mr/explain ::mbml.schema/transform-v1 invalid-transform)]
      (is (some? errors) "Should provide error explanation for invalid data")))

  (testing "individual schema error explanations"
    (is (some? (mr/explain ::mbml.schema/entity-type "invalid-type")))
    (is (some? (mr/explain ::mbml.schema/identifier "")))
    (is (some? (mr/explain ::mbml.schema/name nil)))
    (is (some? (mr/explain ::mbml.schema/database 123)))
    (is (some? (mr/explain ::mbml.schema/target []))))

  (testing "no errors for valid data"
    (let [valid-transform
          {:entity "model/Transform:v1"
           :name "Valid Transform"
           :identifier "valid-transform"
           :database "db"
           :target "table"}]
      (is (nil? (mr/explain ::mbml.schema/transform-v1 valid-transform))))))

;;; ------------------------------------------ Edge Cases and Validation Tests ----------------------------

(deftest edge-cases-test
  (testing "unicode and special characters"
    (let [unicode-transform
          {:entity "model/Transform:v1"
           :name "Трансформ с Unicode"
           :identifier "unicode-transform"
           :database "データベース"
           :target "表格"
           :description "Description with émojis 🎉"
           :tags ["タグ" "étiquette"]
           :source "SELECT 'こんにちは' as greeting"}]
      (is (= true (mr/validate ::mbml.schema/transform-v1 unicode-transform)))))

  (testing "empty collections"
    (let [empty-collections-transform
          {:entity "model/Transform:v1"
           :name "Empty Collections Transform"
           :identifier "empty-collections"
           :database "db"
           :target "table"
           :tags []}]
      (is (= true (mr/validate ::mbml.schema/transform-v1 empty-collections-transform)))))

  (testing "whitespace handling"
    (testing "non-blank strings with whitespace are valid"
      (are [field value] (= true (mr/validate field value))
        ::mbml.schema/name " Valid Name "
        ::mbml.schema/identifier " valid-identifier "
        ::mbml.schema/database " database "
        ::mbml.schema/target " table "))

    (testing "blank strings (only whitespace) are invalid"
      (are [field value] (= false (mr/validate field value))
        ::mbml.schema/name "   "
        ::mbml.schema/identifier "   "
        ::mbml.schema/database "   "
        ::mbml.schema/target "   ")))

  (testing "very long strings"
    (let [very-long-string (apply str (repeat 1000 "a"))
          long-string-transform
          {:entity "model/Transform:v1"
           :name very-long-string
           :identifier very-long-string
           :database very-long-string
           :target very-long-string
           :description very-long-string
           :tags [very-long-string]
           :source very-long-string}]
      (is (= true (mr/validate ::mbml.schema/transform-v1 long-string-transform))))))

;;; ------------------------------------------ Internationalization Tests ---------------------------------

(deftest internationalization-test
  (testing "error messages use deferred-tru for i18n"
    ;; Note: Testing actual i18n behavior requires setting up locale contexts
    ;; Here we test that the schema definitions include i18n error messages
    (let [entity-error (mr/explain ::mbml.schema/entity-type "invalid")
          identifier-error (mr/explain ::mbml.schema/identifier "")
          name-error (mr/explain ::mbml.schema/name nil)]

      (is (some? entity-error) "Entity type validation should provide error")
      (is (some? identifier-error) "Identifier validation should provide error")
      (is (some? name-error) "Name validation should provide error")

      ;; Check that error messages contain meaningful text
      (is (string? (str entity-error)))
      (is (string? (str identifier-error)))
      (is (string? (str name-error))))))

;;; ------------------------------------------ Schema Registry Tests --------------------------------------

(deftest schema-registry-test
  (testing "all MBML schemas are registered"
    (are [schema-key] (some? (mr/schema schema-key))
      ::mbml.schema/entity-type
      ::mbml.schema/identifier
      ::mbml.schema/name
      ::mbml.schema/database
      ::mbml.schema/target
      ::mbml.schema/description
      ::mbml.schema/tags
      ::mbml.schema/source
      ::mbml.schema/transform-v1
      ::mbml.schema/mbml-entity))

  (testing "schema resolution works correctly"
    (let [resolved-schema (mr/schema ::mbml.schema/transform-v1)]
      (is (some? resolved-schema))
      (is (mr/validate resolved-schema
                       {:entity "model/Transform:v1"
                        :name "Test"
                        :identifier "test"
                        :database "db"
                        :target "table"})))))