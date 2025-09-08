(ns metabase-enterprise.library.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.git-source-of-truth.settings :as git-source-of-truth.settings]
   [metabase-enterprise.library.core :as library]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase.test :as mt]))

(def transform-yaml-1-for-index
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

(def transform-yaml-2-for-index
  "entity: model/Transform:v1
name: Second Batch Transform
identifier: batch-transform-2
description: Second transform for batch testing
tags:
  - test
database: test-data (postgres)
target:
  type: table
  name: batch_output_2
source: |
  SELECT * FROM table2 WHERE status = 'complete'")

(deftest index-library-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (mt/with-model-cleanup [:model/Transform]
        (testing "Successfully load multiple MBML files"
          (mt/with-temp [:model/TransformTag {tag-id-test :id} {:name "test"}
                         :model/TransformTag {tag-id-batch :id} {:name "batch"}]
            (mt/with-temp-file [temp-file-1 "transform1.yaml"
                                temp-file-2 "transform2.yaml"]
              (spit temp-file-1 transform-yaml-1-for-index)
              (spit temp-file-2 transform-yaml-2-for-index)
              (let [result-models (atom {})
                    result-index (atom {})]
                (mt/with-temporary-setting-values [git-source-of-truth.settings/git-sync-import-branch "test-branch"]
                  (with-redefs [library/branch+filename->model result-models
                                library/branch+entity+index->filename result-index]
                    (library/index-library! [temp-file-1 temp-file-2])
                    (is (=? {"test-branch" {temp-file-1 {:name "First Batch Transform"
                                                         :identifier "batch-transform-1"}
                                            temp-file-2 {:name "Second Batch Transform"
                                                         :identifier "batch-transform-2"}}}
                            @result-models))
                    (is (= {"test-branch" {:model/Transform {:tag {"test" #{temp-file-2 temp-file-1}
                                                                   "batch" #{temp-file-1}}
                                                             :tag_id {tag-id-test #{temp-file-2 temp-file-1}
                                                                      tag-id-batch #{temp-file-1}}
                                                             :identifier {"batch-transform-1" #{temp-file-1}
                                                                          "batch-transform-2" #{temp-file-2}}}}}
                           @result-index)))))))))

      (testing "Empty file list returns empty result"
        (let [result-models (atom {})
              result-index (atom {})]
          (mt/with-temporary-setting-values [git-source-of-truth.settings/git-sync-import-branch "test-branch"]
            (with-redefs [library/branch+filename->model result-models
                          library/branch+entity+index->filename result-index]
              (library/index-library! [])
              (is (= {"test-branch" {}} @result-models))
              (is (= {"test-branch" {}} @result-index)))))))))

(deftest select-test
  (testing "select retrieves a model by entity and identifier"
    (mt/with-temporary-setting-values [git-source-of-truth.settings/git-sync-import-branch "test-branch"]
      (let [test-model {:entity "model/Transform:v1"
                        :identifier "test-transform"
                        :name "Test Transform"}]
        (with-redefs [library/branch+filename->model (atom {"test-branch" {"test-file.yaml" test-model}})
                      library/branch+entity+index->filename (atom {"test-branch" {:model/Transform {:identifier {"test-transform" #{"test-file.yaml"}}}}})]
          (is (= test-model (library/select :model/Transform "test-transform")))))))

  (testing "select returns nil when model doesn't exist"
    (mt/with-temporary-setting-values [git-source-of-truth.settings/git-sync-import-branch "test-branch"]
      (with-redefs [library/branch+filename->model (atom {"test-branch" {}})
                    library/branch+entity+index->filename (atom {"test-branch" {}})]
        (is (nil? (library/select :model/Transform "non-existent"))))))

  (testing "select with wrong entity type returns nil"
    (mt/with-temporary-setting-values [git-source-of-truth.settings/git-sync-import-branch "test-branch"]
      (let [test-model {:entity "model/Transform:v1"
                        :identifier "test-transform"
                        :name "Test Transform"}]
        (with-redefs [library/branch+filename->model (atom {"test-branch" {"test-file.yaml" test-model}})
                      library/branch+entity+index->filename (atom {"test-branch" {:model/Transform {:identifier {"test-transform" #{"test-file.yaml"}}}}})]
          (is (nil? (library/select :model/SomeOtherType "test-transform")))))))

  (testing "select uses dynamic branch binding when set"
    (let [test-model {:entity "model/Transform:v1"
                      :identifier "test-transform"
                      :name "Test Transform"}]
      (with-redefs [library/branch+filename->model (atom {"custom-branch" {"test-file.yaml" test-model}})
                    library/branch+entity+index->filename (atom {"custom-branch" {:model/Transform {:identifier {"test-transform" #{"test-file.yaml"}}}}})]
        (binding [library/*current-branch* "custom-branch"]
          (is (= test-model (library/select :model/Transform "test-transform"))))))))

(deftest find-by-test
  (testing "find-by retrieves models by index"
    (mt/with-temporary-setting-values [git-source-of-truth.settings/git-sync-import-branch "test-branch"]
      (let [model1 {:entity "model/Transform:v1"
                    :identifier "transform-1"
                    :tags ["test" "batch"]}
            model2 {:entity "model/Transform:v1"
                    :identifier "transform-2"
                    :tags ["test"]}]
        (with-redefs [library/branch+filename->model (atom {"test-branch" {"file1.yaml" model1
                                                                           "file2.yaml" model2}})
                      library/branch+entity+index->filename (atom {"test-branch" {:model/Transform {:tag {"test" #{"file1.yaml" "file2.yaml"}
                                                                                                          "batch" #{"file1.yaml"}}}}})]
          (is (= #{model1 model2} (set (library/find-by :model/Transform :tag ["test"]))))
          (is (= [model1] (library/find-by :model/Transform :tag ["batch"])))))))

  (testing "find-by with multiple values"
    (mt/with-temporary-setting-values [git-source-of-truth.settings/git-sync-import-branch "test-branch"]
      (let [model1 {:entity "model/Transform:v1"
                    :identifier "transform-1"
                    :tags ["test"]}
            model2 {:entity "model/Transform:v1"
                    :identifier "transform-2"
                    :tags ["batch"]}
            model3 {:entity "model/Transform:v1"
                    :identifier "transform-3"
                    :tags ["prod"]}]
        (with-redefs [library/branch+filename->model (atom {"test-branch" {"file1.yaml" model1
                                                                           "file2.yaml" model2
                                                                           "file3.yaml" model3}})
                      library/branch+entity+index->filename (atom {"test-branch" {:model/Transform {:tag {"test" #{"file1.yaml"}
                                                                                                          "batch" #{"file2.yaml"}
                                                                                                          "prod" #{"file3.yaml"}}}}})]
          (is (= #{model1 model2} (set (library/find-by :model/Transform :tag ["test" "batch"]))))))))

  (testing "find-by returns empty sequence when no matches"
    (mt/with-temporary-setting-values [git-source-of-truth.settings/git-sync-import-branch "test-branch"]
      (with-redefs [library/branch+filename->model (atom {"test-branch" {}})
                    library/branch+entity+index->filename (atom {"test-branch" {:model/Transform {:tag {}}}})]
        (is (empty? (library/find-by :model/Transform :tag ["non-existent"]))))))

  (testing "find-by uses dynamic branch binding when set"
    (let [test-model {:entity "model/Transform:v1"
                      :identifier "test-transform"
                      :tags ["test"]}]
      (with-redefs [library/branch+filename->model (atom {"custom-branch" {"test-file.yaml" test-model}})
                    library/branch+entity+index->filename (atom {"custom-branch" {:model/Transform {:tag {"test" #{"test-file.yaml"}}}}})]
        (binding [library/*current-branch* "custom-branch"]
          (is (= [test-model] (library/find-by :model/Transform :tag ["test"]))))))))
