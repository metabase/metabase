(ns metabase-enterprise.transforms.models-test
  "Tests for transform jobs and tags database tables and basic CRUD operations."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.models.transform :as transform.model]
   [metabase-enterprise.transforms.models.transform-job :as transform-job]
   [metabase-enterprise.transforms.models.transform-tag :as transform-tag]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;; Use the default test fixture which sets up the test database
(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest job-tags-association-test
  (testing "Job-tag associations via join table"
    (mt/with-temp [:model/TransformJob job {}
                   :model/TransformTag tag1 {}
                   :model/TransformTag tag2 {}
                   :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag1) :position 0}
                   :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag2) :position 1}]
      (testing "Can retrieve tags for job"
        (let [tag-ids (t2/select-fn-set :tag_id :model/TransformJobTransformTag :job_id (:id job))]
          (is (contains? tag-ids (:id tag1)) "Should include first tag")
          (is (contains? tag-ids (:id tag2)) "Should include second tag")
          (is (= 2 (count tag-ids)) "Should have exactly 2 tags")))

      (testing "Can retrieve jobs for tag"
        (let [job-ids (t2/select-fn-set :job_id :model/TransformJobTransformTag :tag_id (:id tag1))]
          (is (contains? job-ids (:id job)) "Should include the job"))))))

(deftest cascade-delete-tag-test
  (testing "Deleting a tag cascades to associations"
    (mt/with-temp [:model/TransformTag tag {}
                   :model/TransformJob job {}
                   :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag) :position 0}]
      ;; Delete the tag
      (t2/delete! :model/TransformTag :id (:id tag))

      ;; Verify cascade deletion
      (testing "Tag associations are deleted"
        (is (not (t2/exists? :model/TransformJobTransformTag :tag_id (:id tag)))
            "Job-tag association should be deleted"))

      ;; Verify job still exists
      (is (t2/exists? :model/TransformJob :id (:id job))
          "Job should still exist after tag deletion"))))

(deftest cascade-delete-job-test
  (testing "Deleting a job cascades to associations"
    (mt/with-temp [:model/TransformTag tag {}
                   :model/TransformJob job {}
                   :model/TransformJobTransformTag _ {:job_id (:id job) :tag_id (:id tag) :position 0}]
      ;; Delete the job (not the tag)
      (t2/delete! :model/TransformJob :id (:id job))

      ;; Verify cascade deletion
      (testing "Tag associations are deleted"
        (is (not (t2/exists? :model/TransformJobTransformTag :job_id (:id job)))
            "Job-tag association should be deleted"))

      ;; Verify tag still exists
      (is (t2/exists? :model/TransformTag :id (:id tag))
          "Tag should still exist after job deletion"))))

(deftest transform-tag-helper-functions-test
  (testing "TransformTag helper functions"
    (mt/with-temp [:model/TransformTag tag {}]
      (testing "tag-name-exists?"
        (is (transform-tag/tag-name-exists? (:name tag))
            "Should return true for existing tag name")
        (is (not (transform-tag/tag-name-exists? (str "nonexistent-" (u/generate-nano-id))))
            "Should return false for non-existing tag name"))

      (testing "tag-name-exists-excluding?"
        (is (not (transform-tag/tag-name-exists-excluding? (:name tag) (:id tag)))
            "Should return false when checking same tag's name")
        (is (transform-tag/tag-name-exists-excluding? (:name tag) (inc (:id tag)))
            "Should return true when name exists but with different ID")))))

(deftest hydrate-tag-ids-test
  (testing "TransformJob tag_ids hydration preserves position order"
    (mt/with-temp [:model/TransformJob job1 {:name "job1" :schedule "0 0 * * * ?"}
                   :model/TransformJob job2 {:name "job2" :schedule "0 0 * * * ?"}
                   :model/TransformTag tag1 {:name "tag1"}
                   :model/TransformTag tag2 {:name "tag2"}
                   :model/TransformJobTransformTag _ {:job_id (:id job1) :tag_id (:id tag1) :position 0}
                   :model/TransformJobTransformTag _ {:job_id (:id job1) :tag_id (:id tag2) :position 1}
                   :model/TransformJobTransformTag _ {:job_id (:id job2) :tag_id (:id tag2) :position 0}]

      (testing "Hydration adds tag_ids to jobs in position order"
        (let [[hjob1 hjob2] (t2/hydrate [job1 job2] :tag_ids)]
          (is (= [(:id tag1) (:id tag2)] (:tag_ids hjob1))
              "Job1 should have both tags in position order")
          (is (= [(:id tag2)] (:tag_ids hjob2))
              "Job2 should have only tag2")))

      (testing "Jobs with no tags have empty tag_ids"
        (mt/with-temp [:model/TransformJob job3 {}]
          (let [[hydrated-job] (t2/hydrate [job3] :tag_ids)]
            (is (= [] (:tag_ids hydrated-job))
                "Job with no tags should have empty tag_ids array")))))))

(deftest transform-tags-ordering-test
  (testing "Transform tags maintain specified order through updates"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform {}
                     :model/TransformTag tag1 {:name "tag1"}
                     :model/TransformTag tag2 {:name "tag2"}
                     :model/TransformTag tag3 {:name "tag3"}
                     :model/TransformTag tag4 {:name "tag4"}]
        (let [transform-id (:id transform)]

          (testing "Initial tag order is preserved"
            (transform.model/update-transform-tags! transform-id [(:id tag2) (:id tag1) (:id tag3)])
            (let [hydrated (t2/hydrate (t2/select-one :model/Transform :id transform-id) :transform_tag_ids)]
              (is (= [(:id tag2) (:id tag1) (:id tag3)] (:tag_ids hydrated))
                  "Tags should be in the order specified")))

          (testing "Reordering tags preserves new order"
            (transform.model/update-transform-tags! transform-id [(:id tag3) (:id tag1) (:id tag2)])
            (let [hydrated (t2/hydrate (t2/select-one :model/Transform :id transform-id) :transform_tag_ids)]
              (is (= [(:id tag3) (:id tag1) (:id tag2)] (:tag_ids hydrated))
                  "Tags should be reordered correctly")))

          (testing "Adding and removing tags preserves order"
            (transform.model/update-transform-tags! transform-id [(:id tag1) (:id tag4)])
            (let [hydrated (t2/hydrate (t2/select-one :model/Transform :id transform-id) :transform_tag_ids)]
              (is (= [(:id tag1) (:id tag4)] (:tag_ids hydrated))
                  "Should have only the specified tags in order")))

          (testing "Duplicate tags are deduplicated while preserving order"
            (transform.model/update-transform-tags! transform-id [(:id tag2) (:id tag3) (:id tag2) (:id tag1)])
            (let [hydrated (t2/hydrate (t2/select-one :model/Transform :id transform-id) :transform_tag_ids)]
              (is (= [(:id tag2) (:id tag3) (:id tag1)] (:tag_ids hydrated))
                  "Duplicates removed, order preserved"))))))))

(deftest job-tags-ordering-test
  (testing "Job tags maintain specified order through updates"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/TransformJob job {:name "test job" :schedule "0 0 * * *"}
                     :model/TransformTag tag1 {:name "tag1"}
                     :model/TransformTag tag2 {:name "tag2"}
                     :model/TransformTag tag3 {:name "tag3"}]
        (let [job-id (:id job)]

          (testing "Initial tag order is preserved"
            (transform-job/update-job-tags! job-id [(:id tag2) (:id tag1)])
            (let [hydrated (t2/hydrate (t2/select-one :model/TransformJob :id job-id) :tag_ids)]
              (is (= [(:id tag2) (:id tag1)] (:tag_ids hydrated))
                  "Tags should be in the order specified")))

          (testing "Reordering and adding tags preserves order"
            (transform-job/update-job-tags! job-id [(:id tag1) (:id tag3) (:id tag2)])
            (let [hydrated (t2/hydrate (t2/select-one :model/TransformJob :id job-id) :tag_ids)]
              (is (= [(:id tag1) (:id tag3) (:id tag2)] (:tag_ids hydrated))
                  "Tags should be reordered with new tag added"))))))))
