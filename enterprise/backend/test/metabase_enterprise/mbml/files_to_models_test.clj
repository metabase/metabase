(ns metabase-enterprise.mbml.files-to-models-test
  "Unit tests for the mbml-files->models batch loading function.

  Tests comprehensive functionality of loading multiple MBML files transactionally,
  including success scenarios, error handling, and orphaned model cleanup."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.mbml.core :as mbml.core]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; ---------------------------------------- Test Data ------------------------------------------------

(def transform-yaml-1-for-batch-test
  "entity: model/Transform:v1
name: First Batch Transform
identifier: batch-transform-1
description: First transform for batch testing
tags:
  - test
  - batch
database: test-data (postgres)
target:
  type: table
  name: batch_output_1
source: |
  SELECT * FROM table1 WHERE active = true")

(def transform-yaml-2-for-batch-test
  "entity: model/Transform:v1
name: Second Batch Transform
identifier: batch-transform-2
description: Second transform for batch testing
tags:
  - test
  - batch
database: test-data (postgres)
target:
  type: table
  name: batch_output_2
source: |
  SELECT * FROM table2 WHERE status = 'complete'")

(def transform-yaml-3-for-batch-test
  "entity: model/Transform:v1
name: Third Batch Transform
identifier: batch-transform-3
description: Third transform for batch testing
tags:
  - test
database: test-data (postgres)
target:
  type: table
  name: batch_output_3
source: |
  SELECT * FROM table3 WHERE created_at > '2024-01-01'")

(def transform-yaml-invalid-for-batch-test
  "entity: model/Transform:v1
name: Invalid Transform
identifier: invalid-transform
description: Invalid transform that will cause failure
tags:
  - nonexistent-tag
database: test-data (postgres)
target:
  type: table
  name: invalid_output
source: |
  SELECT * FROM invalid_table")

(def malformed-yaml-content
  "entity: model/Transform:v1
name: Malformed YAML
identifier: malformed
  invalid_indentation: true
database: test-db
target: test_table")

(def transform-sql-for-model-test
  "-- METABASE_BEGIN
-- entity: model/Transform:v1
-- name: SQL Transform for Model Creation
-- identifier: sql-transform-model
-- description: SQL transform used for testing
-- tags:
--   - test
--   - daily
-- database: test-data (postgres)
-- target:
--   type: table
--   name: sql_transform_output
-- METABASE_END

SELECT
  customer_id,
  COUNT(*) as order_count,
  SUM(total) as total_value
FROM orders
WHERE status = 'completed'
GROUP BY customer_id;")

;;; ---------------------------------------- Successful Batch Loading Tests ---------------------------

(deftest mbml-files->models-successful-batch-loading-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (testing "Successfully load multiple MBML files"
        (mt/with-model-cleanup [:model/Transform]
          (mt/with-temp [:model/TransformTag {tag-id-test :id} {:name "test"}
                         :model/TransformTag {tag-id-batch :id} {:name "batch"}]
            (mt/with-temp-file [temp-file-1 "transform1.yaml"
                                temp-file-2 "transform2.yaml"
                                temp-file-3 "transform3.yaml"]
              (spit temp-file-1 transform-yaml-1-for-batch-test)
              (spit temp-file-2 transform-yaml-2-for-batch-test)
              (spit temp-file-3 transform-yaml-3-for-batch-test)

              (let [results (mbml.core/mbml-files->models [temp-file-1 temp-file-2 temp-file-3])]
                ;; Check we got 3 results
                (is (= 3 (count results)))

                ;; Check each transform was created with correct properties
                (is (=? [{:name "First Batch Transform"
                          :library_identifier "batch-transform-1"
                          :description "First transform for batch testing"}
                         {:name "Second Batch Transform"
                          :library_identifier "batch-transform-2"
                          :description "Second transform for batch testing"}
                         {:name "Third Batch Transform"
                          :library_identifier "batch-transform-3"
                          :description "Third transform for batch testing"}]
                        results))

                ;; Verify all transforms exist in database
                (let [saved-transforms (t2/select :model/Transform
                                                  {:where [:in :library_identifier
                                                           ["batch-transform-1"
                                                            "batch-transform-2"
                                                            "batch-transform-3"]]})]
                  (is (= 3 (count saved-transforms)))))))))

      (testing "Empty file list returns empty result"
        (let [results (mbml.core/mbml-files->models [])]
          (is (= [] results)))))))

;;; ---------------------------------------- Transactional Rollback Tests -----------------------------

(deftest mbml-files->models-transactional-rollback-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (mt/with-model-cleanup [:model/Transform]
        (testing "Transaction rolls back when one file fails"
          (mt/with-temp [:model/TransformTag {tag-id-test :id} {:name "test"}
                         :model/TransformTag {tag-id-batch :id} {:name "batch"}]
            (mt/with-temp-file [temp-file-1 "transform1.yaml"
                                temp-file-2 "transform2.yaml"
                                temp-file-invalid "invalid.yaml"]
              (spit temp-file-1 transform-yaml-1-for-batch-test)
              (spit temp-file-2 transform-yaml-2-for-batch-test)
              (spit temp-file-invalid transform-yaml-invalid-for-batch-test)

              ;; This should fail because "nonexistent-tag" doesn't exist
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"Supplied tags do not exist.*nonexistent-tag"
                   (mbml.core/mbml-files->models [temp-file-1 temp-file-2 temp-file-invalid])))

              ;; Verify no transforms were created (transaction rolled back)
              (let [created-transforms (t2/select :model/Transform
                                                  {:where [:in :library_identifier
                                                           ["batch-transform-1"
                                                            "batch-transform-2"
                                                            "invalid-transform"]]})]
                (is (= 0 (count created-transforms)))))))

        (testing "Transaction rolls back on malformed MBML"
          (mt/with-temp [:model/TransformTag {tag-id-test :id} {:name "test"}
                         :model/TransformTag {tag-id-batch :id} {:name "batch"}]
            (mt/with-temp-file [temp-file-1 "transform1.yaml"
                                temp-file-malformed "malformed.yaml"]
              (spit temp-file-1 transform-yaml-1-for-batch-test)
              (spit temp-file-malformed malformed-yaml-content)

              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"YAML|parse"
                   (mbml.core/mbml-files->models [temp-file-1 temp-file-malformed])))

              ;; Verify first transform wasn't created
              (let [created-transform (t2/select-one :model/Transform
                                                     :library_identifier "batch-transform-1")]
                (is (nil? created-transform))))))))))

;;; ---------------------------------------- Orphaned Model Cleanup Tests -----------------------------

(deftest mbml-files->models-orphaned-cleanup-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (mt/with-model-cleanup [:model/Transform]
        (testing "Clean up orphaned models with library_identifier"
          (mt/with-temp [:model/TransformTag {tag-id-test :id} {:name "test"}
                         :model/TransformTag {tag-id-batch :id} {:name "batch"}
                         ;; Create existing transforms with library_identifiers
                         :model/Transform {orphan-1-id :id} {:name "Orphan Transform 1"
                                                             :library_identifier "orphan-1"
                                                             :description "Will be deleted"
                                                             :source "{\"type\":\"native\",\"native\":{\"query\":\"SELECT 1\"}}"
                                                             :target "{\"type\":\"table\",\"name\":\"orphan_1\"}"}
                         :model/Transform {orphan-2-id :id} {:name "Orphan Transform 2"
                                                             :library_identifier "orphan-2"
                                                             :description "Will also be deleted"
                                                             :source "{\"type\":\"native\",\"native\":{\"query\":\"SELECT 2\"}}"
                                                             :target "{\"type\":\"table\",\"name\":\"orphan_2\"}"}
                         ;; Create a transform without library_identifier (should not be deleted)
                         :model/Transform {manual-id :id} {:name "Manual Transform"
                                                           :library_identifier nil
                                                           :description "Created manually, should persist"
                                                           :source "{\"type\":\"native\",\"native\":{\"query\":\"SELECT 3\"}}"
                                                           :target "{\"type\":\"table\",\"name\":\"manual\"}"}
                         ;; Create tags for the orphaned transforms
                         :model/TransformTransformTag _ {:tag_id tag-id-test :transform_id orphan-1-id :position 0}
                         :model/TransformTransformTag _ {:tag_id tag-id-test :transform_id orphan-2-id :position 0}
                         :model/TransformTransformTag _ {:tag_id tag-id-test :transform_id manual-id :position 0}]

            (mt/with-temp-file [temp-file-1 "transform1.yaml"
                                temp-file-2 "transform2.yaml"]
              (spit temp-file-1 transform-yaml-1-for-batch-test)
              (spit temp-file-2 transform-yaml-2-for-batch-test)

              ;; Load new transforms
              (let [results (mbml.core/mbml-files->models [temp-file-1 temp-file-2])]
                (is (= 2 (count results)))

                ;; Verify orphaned transforms were deleted
                (is (nil? (t2/select-one :model/Transform :id orphan-1-id)))
                (is (nil? (t2/select-one :model/Transform :id orphan-2-id)))

                ;; Verify manual transform (without library_identifier) was preserved
                (is (some? (t2/select-one :model/Transform :id manual-id)))

                ;; Verify new transforms exist
                (let [loaded-transforms (t2/select :model/Transform
                                                   {:where [:in :library_identifier
                                                            ["batch-transform-1"
                                                             "batch-transform-2"]]})]
                  (is (= 2 (count loaded-transforms)))))))))

      (mt/with-model-cleanup [:model/Transform]
        (testing "Update existing transforms and clean up others"
          (mt/with-temp [:model/TransformTag {tag-id-test :id} {:name "test"}
                         :model/TransformTag {tag-id-test :id} {:name "batch"}
                         :model/Transform {existing-id :id} {:name "Existing Transform"
                                                             :library_identifier "batch-transform-1"
                                                             :description "Old description"
                                                             :source "{\"type\":\"native\",\"native\":{\"query\":\"SELECT old\"}}"
                                                             :target "{\"type\":\"table\",\"name\":\"old_table\"}"}
                         :model/Transform {orphan-id :id} {:name "Orphan Transform"
                                                           :library_identifier "will-be-deleted"
                                                           :description "Will be deleted"
                                                           :source "{\"type\":\"native\",\"native\":{\"query\":\"SELECT orphan\"}}"
                                                           :target "{\"type\":\"table\",\"name\":\"orphan\"}"}
                         :model/TransformTransformTag _ {:tag_id tag-id-test :transform_id existing-id :position 0}
                         :model/TransformTransformTag _ {:tag_id tag-id-test :transform_id orphan-id :position 0}]

            (mt/with-temp-file [temp-file "transform.yaml"]
              (spit temp-file transform-yaml-1-for-batch-test)

              (let [results (mbml.core/mbml-files->models [temp-file])]
                (is (= 1 (count results)))

                ;; Verify existing transform was updated (same ID)
                (is (= existing-id (:id (first results))))
                (is (=? {:name "First Batch Transform"
                         :description "First transform for batch testing"}
                        (first results)))

                ;; Verify orphan was deleted
                (is (nil? (t2/select-one :model/Transform :id orphan-id)))))))))))

;;; ---------------------------------------- Edge Cases and Error Handling Tests ----------------------

(deftest mbml-files->models-edge-cases-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (mt/with-model-cleanup [:model/Transform]
        (testing "Handle duplicate identifiers in input"
          (mt/with-temp [:model/TransformTag {tag-id-test :id} {:name "test"}
                         :model/TransformTag {tag-id-test :id} {:name "batch"}]
            (mt/with-temp-file [temp-file-1 "transform1.yaml"
                                temp-file-2 "transform2.yaml"]
              ;; Both files have the same identifier
              (spit temp-file-1 transform-yaml-1-for-batch-test)
              (spit temp-file-2 (str/replace transform-yaml-2-for-batch-test
                                             "batch-transform-2"
                                             "batch-transform-1"))

              ;; Should create/update only one transform (last one wins)
              (let [results (mbml.core/mbml-files->models [temp-file-1 temp-file-2])]
                (is (= 2 (count results)))

                ;; Both results should have the same ID (updated same record)
                (is (= (:id (first results)) (:id (second results))))

                ;; Final state should be from the second file
                (let [final-transform (t2/select-one :model/Transform
                                                     :library_identifier "batch-transform-1")]
                  (is (=? {:name "Second Batch Transform"
                           :description "Second transform for batch testing"}
                          final-transform))))))))

      (mt/with-model-cleanup [:model/Transform]
        (testing "Mixed file types in batch"
          (mt/with-temp [:model/TransformTag {tag-id-test :id} {:name "test"}
                         :model/TransformTag {tag-id-test :id} {:name "batch"}]
            (mt/with-temp-file [yaml-file "transform.yaml"
                                sql-file "transform.sql"]
              (spit yaml-file transform-yaml-1-for-batch-test)
              (spit sql-file transform-sql-for-model-test)

              (let [results (mbml.core/mbml-files->models [yaml-file sql-file])]
                (is (= 2 (count results)))

                (is (=? [{:name "First Batch Transform"}
                         {:name "SQL Transform for Model Creation"}]
                        results)))))))

      (mt/with-model-cleanup [:model/Transform]
        (testing "File not found in batch"
          (mt/with-temp [:model/TransformTag {tag-id-test :id} {:name "test"}
                         :model/TransformTag {tag-id-test :id} {:name "batch"}]
            (mt/with-temp-file [temp-file-1 "transform1.yaml"]
              (spit temp-file-1 transform-yaml-1-for-batch-test)

              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"File not found"
                   (mbml.core/mbml-files->models [temp-file-1 "/nonexistent/file.yaml"]))))))))))

(deftest mbml-files->models-cleanup-scope-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (mt/with-model-cleanup [:model/Transform]
        (testing "Cleanup only affects models with library_identifier"
          (mt/with-temp [:model/TransformTag {tag-id-test :id} {:name "test"}
                         :model/TransformTag {tag-id-test :id} {:name "batch"}
                         ;; Create multiple transforms with different scenarios
                         :model/Transform {lib-transform-1 :id} {:name "Library Transform 1"
                                                                 :library_identifier "lib-1"
                                                                 :description "Has library ID, will be deleted"
                                                                 :source "{\"type\":\"native\",\"native\":{\"query\":\"SELECT 1\"}}"
                                                                 :target "{\"type\":\"table\",\"name\":\"lib1\"}"}
                         :model/Transform {lib-transform-2 :id} {:name "Library Transform 2"
                                                                 :library_identifier "lib-2"
                                                                 :description "Has library ID, will be deleted"
                                                                 :source "{\"type\":\"native\",\"native\":{\"query\":\"SELECT 2\"}}"
                                                                 :target "{\"type\":\"table\",\"name\":\"lib2\"}"}
                         :model/Transform {manual-1 :id} {:name "Manual Transform 1"
                                                          :library_identifier nil
                                                          :description "No library ID, should persist"
                                                          :source "{\"type\":\"native\",\"native\":{\"query\":\"SELECT 3\"}}"
                                                          :target "{\"type\":\"table\",\"name\":\"manual1\"}"}
                         :model/Transform {manual-2 :id} {:name "Manual Transform 2"
                                                          :library_identifier nil
                                                          :description "No library ID, should persist"
                                                          :source "{\"type\":\"native\",\"native\":{\"query\":\"SELECT 4\"}}"
                                                          :target "{\"type\":\"table\",\"name\":\"manual2\"}"}
                         :model/TransformTransformTag _ {:tag_id tag-id-test :transform_id lib-transform-1 :position 0}
                         :model/TransformTransformTag _ {:tag_id tag-id-test :transform_id lib-transform-2 :position 0}
                         :model/TransformTransformTag _ {:tag_id tag-id-test :transform_id manual-1 :position 0}
                         :model/TransformTransformTag _ {:tag_id tag-id-test :transform_id manual-2 :position 0}]

            (mt/with-temp-file [temp-file "transform.yaml"]
              (spit temp-file transform-yaml-1-for-batch-test)

              ;; Load one new transform
              (let [results (mbml.core/mbml-files->models [temp-file])]
                (is (= 1 (count results)))

                ;; Verify library-managed transforms were deleted
                (is (nil? (t2/select-one :model/Transform :id lib-transform-1)))
                (is (nil? (t2/select-one :model/Transform :id lib-transform-2)))

                ;; Verify manual transforms persist
                (is (some? (t2/select-one :model/Transform :id manual-1)))
                (is (some? (t2/select-one :model/Transform :id manual-2)))

                ;; Verify new transform exists
                (is (some? (t2/select-one :model/Transform
                                          :library_identifier "batch-transform-1")))))))))))
