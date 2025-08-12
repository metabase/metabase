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

(deftest default-tags-test
  (testing "Default tags were inserted by migration"
    (doseq [tag-name ["hourly" "daily" "weekly" "monthly"]]
      (testing (str "Tag '" tag-name "' exists")
        (is (t2/exists? :transform_tag :name tag-name)
            (str "Default tag '" tag-name "' should exist"))))))

(deftest tag-crud-test
  (testing "Transform tag CRUD operations"
    (testing "Create and read tag"
      (let [tag-name (str "test-tag-" (u/generate-nano-id))
            tag (t2/insert-returning-instance! :transform_tag {:name tag-name})]
        (is (some? (:id tag)) "Tag should have an ID")
        (is (= tag-name (:name tag)) "Tag name should match")
        (is (some? (:created_at tag)) "Tag should have created_at timestamp")
        (is (some? (:updated_at tag)) "Tag should have updated_at timestamp")

        ;; Read back
        (let [read-tag (t2/select-one :transform_tag :id (:id tag))]
          (is (= tag-name (:name read-tag)) "Retrieved tag name should match"))

        ;; Clean up
        (t2/delete! :transform_tag :id (:id tag))))

    (testing "Update tag"
      (let [original-name (str "original-" (u/generate-nano-id))
            updated-name (str "updated-" (u/generate-nano-id))
            tag (t2/insert-returning-instance! :transform_tag {:name original-name})]
        (t2/update! :transform_tag (:id tag) {:name updated-name})
        (let [updated-tag (t2/select-one :transform_tag :id (:id tag))]
          (is (= updated-name (:name updated-tag)) "Tag name should be updated"))

        ;; Clean up
        (t2/delete! :transform_tag :id (:id tag))))

    (testing "Delete tag"
      (let [tag-name (str "delete-me-" (u/generate-nano-id))
            tag (t2/insert-returning-instance! :transform_tag {:name tag-name})]
        (is (t2/exists? :transform_tag :id (:id tag)) "Tag should exist before deletion")
        (t2/delete! :transform_tag :id (:id tag))
        (is (not (t2/exists? :transform_tag :id (:id tag))) "Tag should not exist after deletion")))))

(deftest job-crud-test
  (testing "Transform job CRUD operations"
    (testing "Create and read job"
      (let [job-name (str "test-job-" (u/generate-nano-id))
            job-description "Test job description"
            job-schedule "0 0 * * * ?"
            entity-id (u/generate-nano-id)
            job (t2/insert-returning-instance! :transform_job
                                               {:name job-name
                                                :description job-description
                                                :schedule job-schedule
                                                :entity_id entity-id})]
        (is (some? (:id job)) "Job should have an ID")
        (is (= job-name (:name job)) "Job name should match")
        (is (= job-description (:description job)) "Job description should match")
        (is (= job-schedule (:schedule job)) "Job schedule should match")
        (is (= entity-id (:entity_id job)) "Job entity_id should match")
        (is (some? (:created_at job)) "Job should have created_at timestamp")
        (is (some? (:updated_at job)) "Job should have updated_at timestamp")

        ;; Read back
        (let [read-job (t2/select-one :transform_job :id (:id job))]
          (is (= job-name (:name read-job)) "Retrieved job name should match"))

        ;; Clean up
        (t2/delete! :transform_job :id (:id job))))

    (testing "Update job"
      (let [original-name (str "original-job-" (u/generate-nano-id))
            original-schedule "0 0 * * * ?"
            updated-name (str "updated-job-" (u/generate-nano-id))
            updated-description "Updated description"
            updated-schedule "0 0 */2 * * ?"
            job (t2/insert-returning-instance! :transform_job
                                               {:name original-name
                                                :schedule original-schedule
                                                :entity_id (u/generate-nano-id)})]
        (t2/update! :transform_job (:id job)
                    {:name updated-name
                     :description updated-description
                     :schedule updated-schedule})
        (let [updated-job (t2/select-one :transform_job :id (:id job))]
          (is (= updated-name (:name updated-job)) "Job name should be updated")
          (is (= updated-description (:description updated-job)) "Job description should be updated")
          (is (= updated-schedule (:schedule updated-job)) "Job schedule should be updated"))

        ;; Clean up
        (t2/delete! :transform_job :id (:id job))))

    (testing "Delete job"
      (let [job-name (str "delete-me-" (u/generate-nano-id))
            job-schedule "0 0 * * * ?"
            job (t2/insert-returning-instance! :transform_job
                                               {:name job-name
                                                :schedule job-schedule
                                                :entity_id (u/generate-nano-id)})]
        (is (t2/exists? :transform_job :id (:id job)) "Job should exist before deletion")
        (t2/delete! :transform_job :id (:id job))
        (is (not (t2/exists? :transform_job :id (:id job))) "Job should not exist after deletion")))))

(deftest job-tags-association-test
  (testing "Job-tag associations via join table"
    (let [job-name (str "job-" (u/generate-nano-id))
          job-schedule "0 0 * * * ?"
          job (t2/insert-returning-instance! :transform_job
                                             {:name job-name
                                              :schedule job-schedule
                                              :entity_id (u/generate-nano-id)})
          tag1 (t2/insert-returning-instance! :transform_tag {:name (str "tag1-" (u/generate-nano-id))})
          tag2 (t2/insert-returning-instance! :transform_tag {:name (str "tag2-" (u/generate-nano-id))})]
      (try
        (testing "Can associate job with tags"
          (t2/insert! :transform_job_tags {:job_id (:id job) :tag_id (:id tag1)})
          (t2/insert! :transform_job_tags {:job_id (:id job) :tag_id (:id tag2)})

          (is (t2/exists? :transform_job_tags :job_id (:id job) :tag_id (:id tag1))
              "First association should exist")
          (is (t2/exists? :transform_job_tags :job_id (:id job) :tag_id (:id tag2))
              "Second association should exist"))

        (testing "Can retrieve tags for job"
          (let [tag-ids (t2/select-fn-set :tag_id :transform_job_tags :job_id (:id job))]
            (is (contains? tag-ids (:id tag1)) "Should include first tag")
            (is (contains? tag-ids (:id tag2)) "Should include second tag")
            (is (= 2 (count tag-ids)) "Should have exactly 2 tags")))

        (testing "Can retrieve jobs for tag"
          (let [job-ids (t2/select-fn-set :job_id :transform_job_tags :tag_id (:id tag1))]
            (is (contains? job-ids (:id job)) "Should include the job")))

        (finally
          ;; Clean up
          (t2/delete! :transform_job_tags :job_id (:id job))
          (t2/delete! :transform_job :id (:id job))
          (t2/delete! :transform_tag :id (:id tag1))
          (t2/delete! :transform_tag :id (:id tag2)))))))

(deftest cascade-delete-tag-test
  (testing "Deleting a tag cascades to associations"
    (let [tag-name (str "cascade-tag-" (u/generate-nano-id))
          tag (t2/insert-returning-instance! :transform_tag {:name tag-name})
          job-name (str "cascade-job-" (u/generate-nano-id))
          job-schedule "0 0 * * * ?"
          job (t2/insert-returning-instance! :transform_job
                                             {:name job-name
                                              :schedule job-schedule
                                              :entity_id (u/generate-nano-id)})]
      (try
        ;; Create association
        (t2/insert! :transform_job_tags {:job_id (:id job) :tag_id (:id tag)})

        ;; Verify association exists
        (is (t2/exists? :transform_job_tags :tag_id (:id tag)))

        ;; Delete the tag
        (t2/delete! :transform_tag :id (:id tag))

        ;; Verify cascade deletion
        (testing "Tag associations are deleted"
          (is (not (t2/exists? :transform_job_tags :tag_id (:id tag)))
              "Job-tag association should be deleted"))

        ;; Verify job still exists
        (is (t2/exists? :transform_job :id (:id job))
            "Job should still exist after tag deletion")

        (finally
          (t2/delete! :transform_job :id (:id job)))))))

(deftest cascade-delete-job-test
  (testing "Deleting a job cascades to associations"
    (let [job-name (str "cascade-job-" (u/generate-nano-id))
          job-schedule "0 0 * * * ?"
          job (t2/insert-returning-instance! :transform_job
                                             {:name job-name
                                              :schedule job-schedule
                                              :entity_id (u/generate-nano-id)})
          tag-name (str "cascade-tag-" (u/generate-nano-id))
          tag (t2/insert-returning-instance! :transform_tag {:name tag-name})]
      (try
        ;; Create association
        (t2/insert! :transform_job_tags {:job_id (:id job) :tag_id (:id tag)})

        ;; Verify association exists
        (is (t2/exists? :transform_job_tags :job_id (:id job)))

        ;; Delete the job
        (t2/delete! :transform_job :id (:id job))

        ;; Verify cascade deletion
        (testing "Job associations are deleted"
          (is (not (t2/exists? :transform_job_tags :job_id (:id job)))
              "Job-tag association should be deleted"))

        ;; Verify tag still exists
        (is (t2/exists? :transform_tag :id (:id tag))
            "Tag should still exist after job deletion")

        (finally
          (t2/delete! :transform_tag :id (:id tag)))))))

(deftest model-table-name-test
  (testing "Model table name resolution"
    (is (= :transform_tag (t2/table-name :model/TransformTag))
        "TransformTag model should resolve to transform_tag table")
    (is (= :transform_job (t2/table-name :model/TransformJob))
        "TransformJob model should resolve to transform_job table")))

(deftest transform-tag-helper-functions-test
  (testing "TransformTag helper functions"
    (let [unique-name (str "unique-tag-" (u/generate-nano-id))
          tag (t2/insert-returning-instance! :model/TransformTag {:name unique-name})]
      (try
        (testing "tag-name-exists?"
          (is (transform-tag/tag-name-exists? unique-name)
              "Should return true for existing tag name")
          (is (not (transform-tag/tag-name-exists? (str "nonexistent-" (u/generate-nano-id))))
              "Should return false for non-existing tag name"))

        (testing "tag-name-exists-excluding?"
          (is (not (transform-tag/tag-name-exists-excluding? unique-name (:id tag)))
              "Should return false when checking same tag's name")
          (is (transform-tag/tag-name-exists-excluding? unique-name (inc (:id tag)))
              "Should return true when name exists but with different ID"))

        (finally
          (t2/delete! :model/TransformTag :id (:id tag)))))))

(deftest hydrate-tag-ids-test
  (testing "TransformJob tag_ids hydration"
    (mt/with-temp [:model/TransformJob job1 {:name "job1" :schedule "0 0 * * * ?"}
                   :model/TransformJob job2 {:name "job2" :schedule "0 0 * * * ?"}
                   :model/TransformTag tag1 {:name "tag1"}
                   :model/TransformTag tag2 {:name "tag2"}]
      ;; Set up associations
      (t2/insert! :transform_job_tags {:job_id (:id job1) :tag_id (:id tag1)})
      (t2/insert! :transform_job_tags {:job_id (:id job1) :tag_id (:id tag2)})
      (t2/insert! :transform_job_tags {:job_id (:id job2) :tag_id (:id tag2)})

      (testing "Hydration adds tag_ids to jobs"
        (let [hydrated-jobs (t2/hydrate [job1 job2] :tag_ids)]
          (is (= 2 (count hydrated-jobs)) "Should hydrate all jobs")

          (let [hydrated-job1 (first (filter #(= (:id job1) (:id %)) hydrated-jobs))
                hydrated-job2 (first (filter #(= (:id job2) (:id %)) hydrated-jobs))]
            (is (= #{(:id tag1) (:id tag2)} (set (:tag_ids hydrated-job1)))
                "Job1 should have both tags")
            (is (= #{(:id tag2)} (set (:tag_ids hydrated-job2)))
                "Job2 should have only tag2"))))

      (testing "Jobs with no tags have empty tag_ids"
        (mt/with-temp [:model/TransformJob job3 {:name "job3" :schedule "0 0 * * * ?"}]
          (let [hydrated-job (first (t2/hydrate [job3] :tag_ids))]
            (is (= [] (:tag_ids hydrated-job))
                "Job with no tags should have empty tag_ids array")))))))
