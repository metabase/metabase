(ns metabase-enterprise.transforms.models-test
  "Tests for transform jobs and tags database tables and basic CRUD operations."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.models.transform-job]
   [metabase-enterprise.transforms.models.transform-tag :as transform-tag]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;; Use the default test fixture which sets up the test database
(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest job-tags-association-test
  (testing "Job-tag associations via join table"
    (mt/with-temp [:model/TransformJob job  {}
                   :model/TransformTag tag1 {}
                   :model/TransformTag tag2 {}
                   :model/TransformJobTags _ {:job_id (:id job) :tag_id (:id tag1)}
                   :model/TransformJobTags _ {:job_id (:id job) :tag_id (:id tag2)}]
      (testing "Can retrieve tags for job"
        (let [tag-ids (t2/select-fn-set :tag_id :model/TransformJobTags :job_id (:id job))]
          (is (contains? tag-ids (:id tag1)) "Should include first tag")
          (is (contains? tag-ids (:id tag2)) "Should include second tag")
          (is (= 2 (count tag-ids)) "Should have exactly 2 tags")))

      (testing "Can retrieve jobs for tag"
        (let [job-ids (t2/select-fn-set :job_id :model/TransformJobTags :tag_id (:id tag1))]
          (is (contains? job-ids (:id job)) "Should include the job"))))))

(deftest cascade-delete-tag-test
  (testing "Deleting a tag cascades to associations"
    (mt/with-temp [:model/TransformTag tag {}
                   :model/TransformJob job {}
                   :model/TransformJobTags _ {:job_id (:id job) :tag_id (:id tag)}]
      ;; Delete the tag
      (t2/delete! :model/TransformTag :id (:id tag))

      ;; Verify cascade deletion
      (testing "Tag associations are deleted"
        (is (not (t2/exists? :model/TransformJobTags :tag_id (:id tag)))
            "Job-tag association should be deleted"))

      ;; Verify job still exists
      (is (t2/exists? :model/TransformJob :id (:id job))
          "Job should still exist after tag deletion"))))

(deftest cascade-delete-job-test
  (testing "Deleting a job cascades to associations"
    (mt/with-temp [:model/TransformTag tag {}
                   :model/TransformJob job {}
                   :model/TransformJobTags _ {:job_id (:id job) :tag_id (:id tag)}]
      ;; Delete the tag
      (t2/delete! :model/TransformJob :id (:id job))

      ;; Verify cascade deletion
      (testing "Tag associations are deleted"
        (is (not (t2/exists? :model/TransformJobTags :job_id (:id job)))
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
  (testing "TransformJob tag_ids hydration"
    (mt/with-temp [:model/TransformJob job1 {:name "job1" :schedule "0 0 * * * ?"}
                   :model/TransformJob job2 {:name "job2" :schedule "0 0 * * * ?"}
                   :model/TransformTag tag1 {:name "tag1"}
                   :model/TransformTag tag2 {:name "tag2"}
                   :model/TransformJobTags _ {:job_id (:id job1) :tag_id (:id tag1)}
                   :model/TransformJobTags _ {:job_id (:id job1) :tag_id (:id tag2)}
                   :model/TransformJobTags _ {:job_id (:id job2) :tag_id (:id tag2)}]

      (testing "Hydration adds tag_ids to jobs"
        (let [[hjob1 hjob2] (t2/hydrate [job1 job2] :tag_ids)]
          (is (= #{(:id tag1) (:id tag2)} (set (:tag_ids hjob1)))
              "Job1 should have both tags")
          (is (= #{(:id tag2)} (set (:tag_ids hjob2)))
              "Job2 should have only tag2")))

      (testing "Jobs with no tags have empty tag_ids"
        (mt/with-temp [:model/TransformJob job3 {}]
          (let [[hydrated-job] (t2/hydrate [job3] :tag_ids)]
            (is (= [] (:tag_ids hydrated-job))
                "Job with no tags should have empty tag_ids array")))))))
