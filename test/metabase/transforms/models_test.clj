(ns metabase.transforms.models-test
  "Tests for transform jobs and tags database tables and basic CRUD operations."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.models.transforms.transform :as transform.model]
   [metabase.models.transforms.transform-job :as transform-job]
   [metabase.models.transforms.transform-tag :as transform-tag]
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

          (testing "Transform created without creator_id defaults to internal user"
            (is (= config/internal-mb-user-id (:creator_id transform))))

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

(deftest table-with-db-and-fields-hydration-test
  (testing "table-with-db-and-fields hydration handles NULL schemas correctly"
    (mt/with-temp [:model/Database {db-id :id} {}
                   ;; Create tables with different schema values
                   :model/Table {table-with-schema-id :id} {:db_id db-id
                                                            :schema "public"
                                                            :name "test_table_with_schema"}
                   :model/Table {table-null-schema-id :id} {:db_id db-id
                                                            :schema nil
                                                            :name "test_table_null_schema"}
                   :model/Table {other-table-id :id} {:db_id db-id
                                                      :schema "other"
                                                      :name "other_table"}
                   ;; Create transforms targeting these tables
                   :model/Transform transform1 {:name "Transform with schema"
                                                :source {:type "query"
                                                         :query {:database db-id
                                                                 :type "native"
                                                                 :native {:query "SELECT 1"
                                                                          :template-tags {}}}}
                                                :target {:type "table"
                                                         :schema "public"
                                                         :name "test_table_with_schema"
                                                         :db_id db-id}}
                   :model/Transform transform2 {:name "Transform with NULL schema"
                                                :source {:type "query"
                                                         :query {:database db-id
                                                                 :type "native"
                                                                 :native {:query "SELECT 2"
                                                                          :template-tags {}}}}
                                                :target {:type "table"
                                                         :schema nil
                                                         :name "test_table_null_schema"
                                                         :db_id db-id}}]

      (testing "Hydrates table with non-NULL schema"
        (let [hydrated (t2/hydrate transform1 :table-with-db-and-fields)]
          (is (some? (:table hydrated))
              "Transform should have hydrated table")
          (is (= table-with-schema-id (-> hydrated :table :id))
              "Should hydrate correct table with schema")))

      (testing "Hydrates table with NULL schema"
        (let [hydrated (t2/hydrate transform2 :table-with-db-and-fields)]
          (is (some? (:table hydrated))
              "Transform with NULL schema should have hydrated table")
          (is (= table-null-schema-id (-> hydrated :table :id))
              "Should hydrate correct table with NULL schema")))

      (testing "Hydrates multiple transforms with mixed schemas in single batch"
        (let [hydrated (t2/hydrate [transform1 transform2] :table-with-db-and-fields)]
          (is (= 2 (count hydrated))
              "Should hydrate both transforms")
          (is (every? (comp some? :table) hydrated)
              "Both transforms should have hydrated tables")
          (is (= #{table-with-schema-id table-null-schema-id}
                 (set (map (comp :id :table) hydrated)))
              "Should hydrate both tables correctly")))

      (testing "Does not hydrate unrelated tables"
        (let [hydrated (t2/hydrate transform1 :table-with-db-and-fields)]
          (is (not= other-table-id (-> hydrated :table :id))
              "Should not hydrate unrelated table"))))))

(deftest creator-hydration-test
  (testing "Transform creator hydration returns user details"
    (let [user1-data {:first_name "Test"
                      :last_name  "Creator"
                      :email      "test.creator@example.com"}
          user2-data {:first_name "Second"
                      :last_name  "User"
                      :email      "second.user@example.com"}]
      (mt/with-temp [:model/User {user1-id :id} user1-data
                     :model/Database {db-id :id} {}
                     :model/Transform transform1 {:name       "Transform with creator"
                                                  :creator_id user1-id
                                                  :source     {:type  "query"
                                                               :query {:database db-id
                                                                       :type     "native"
                                                                       :native   {:query         "SELECT 1"
                                                                                  :template-tags {}}}}
                                                  :target     {:type   "table"
                                                               :schema "public"
                                                               :name   "test_table"
                                                               :db_id  db-id}}
                     :model/User {user2-id :id} user2-data
                     :model/Transform transform2 {:name       "Second transform"
                                                  :creator_id user2-id
                                                  :source     {:type  "query"
                                                               :query {:database db-id
                                                                       :type     "native"
                                                                       :native   {:query         "SELECT 2"
                                                                                  :template-tags {}}}}
                                                  :target     {:type   "table"
                                                               :schema "public"
                                                               :name   "test_table2"
                                                               :db_id  db-id}}]
        (testing "Hydrates creator with user details"
          (is (=? (assoc user1-data :id user1-id)
                  (:creator (t2/hydrate transform1 :creator)))))
        (testing "Hydrates multiple transforms with creators in batch"
          (let [hydrated (t2/hydrate [transform1 transform2] :creator)]
            (is (= 2 (count hydrated))
                "Should hydrate both transforms")
            (is (=? (assoc user1-data :id user1-id)
                    (:creator (first hydrated)))
                "First hydrated should match the first user's data")
            (is (=? (assoc user2-data :id user2-id)
                    (:creator (second hydrated)))
                "Second hydrated should match the second user's data")))))))

(deftest python-transform-source-table-resolution-on-save-test
  (testing "Python transform source-tables with name refs get table_id resolved on save"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id  db-id
                                                :name   "existing_table"
                                                :schema "public"}]
      (testing "table_id is populated when table exists"
        (mt/with-temp [:model/Transform transform {:name   "Transform with ref"
                                                   :source {:type            "python"
                                                            :body            "def transform(): pass"
                                                            :source-database db-id
                                                            :source-tables   {"input" {:database_id db-id
                                                                                       :schema      "public"
                                                                                       :table       "existing_table"}}}
                                                   :target {:type     "table"
                                                            :schema   "public"
                                                            :name     "output"
                                                            :database db-id}}]
          (let [saved        (t2/select-one :model/Transform :id (:id transform))
                source-table (get-in saved [:source :source-tables "input"])]
            (is (= table-id (:table_id source-table))
                "table_id should be resolved from database lookup"))))

      (testing "table_id remains nil when table doesn't exist"
        (mt/with-temp [:model/Transform transform {:name   "Transform with missing ref"
                                                   :source {:type            "python"
                                                            :body            "def transform(): pass"
                                                            :source-database db-id
                                                            :source-tables   {"input" {:database_id db-id
                                                                                       :schema      "public"
                                                                                       :table       "nonexistent_table"}}}
                                                   :target {:type     "table"
                                                            :schema   "public"
                                                            :name     "output"
                                                            :database db-id}}]
          (let [saved        (t2/select-one :model/Transform :id (:id transform))
                source-table (get-in saved [:source :source-tables "input"])]
            (is (nil? (:table_id source-table))
                "table_id should be nil for non-existent table"))))

      (testing "existing table_id is preserved"
        (mt/with-temp [:model/Transform transform {:name   "Transform with explicit table_id"
                                                   :source {:type            "python"
                                                            :body            "def transform(): pass"
                                                            :source-database db-id
                                                            :source-tables   {"input" {:database_id db-id
                                                                                       :schema      "public"
                                                                                       :table       "existing_table"
                                                                                       :table_id    999}}}
                                                   :target {:type     "table"
                                                            :schema   "public"
                                                            :name     "output"
                                                            :database db-id}}]
          (let [saved        (t2/select-one :model/Transform :id (:id transform))
                source-table (get-in saved [:source :source-tables "input"])]
            (is (= 999 (:table_id source-table))
                "explicit table_id should be preserved")))))))

(deftest check-allowed-content-transforms
  (mt/with-premium-features #{:data-studio}
    (mt/with-temp [:model/Collection transforms {:name "Test Transforms" :namespace collection/transforms-ns}
                   :model/Collection regular-col {:name "Test Regular"}]
      (mt/with-model-cleanup [:model/Transform :model/Card]
        (testing "Can only add allowed content types"
          (is (some? (t2/insert! :model/Transform (assoc (mt/with-temp-defaults :model/Transform) :collection_id (:id transforms)))))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A Card can only go in Collections in the.*"
                                (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model :collection_id (:id transforms)}))))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A Transform can only go in Collections in the :transforms namespace."
                                (t2/insert! :model/Transform (assoc (mt/with-temp-defaults :model/Transform) :collection_id (:id regular-col))))))))))
