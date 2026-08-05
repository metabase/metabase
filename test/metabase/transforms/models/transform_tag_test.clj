(ns metabase.transforms.models.transform-tag-test
  "Tests for the transform tag model."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.models.transform-tag :as transform-tag]
   [metabase.util.i18n :as i18n]
   [toucan2.core :as t2]))

(comment transform-tag/keep-me)

(deftest initial-tags-translated-on-select
  (doseq [[type name] [["hourly"  (i18n/trs "hourly")]
                       ["daily"   (i18n/trs "daily")]
                       ["weekly"  (i18n/trs "weekly")]
                       ["monthly" (i18n/trs "monthly")]]]
    (mt/with-temp [:model/TransformTag tag {:name "default" :built_in_type type}]
      (is (= name
             (str (:name (t2/select-one :model/TransformTag (:id tag)))))))))

(deftest initial-tags-translated-on-update
  (doseq [type ["hourly" "daily" "weekly" "monthly"]]
    (mt/with-temp [:model/TransformTag tag {:name "default" :built_in_type type}]
      (t2/update! :model/TransformTag :id (:id tag)
                  {:name "default2"})
      (is (= "default2"
             (:name (t2/select-one :model/TransformTag (:id tag))))))))

(deftest worktree-tag-name-uniqueness-is-per-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {wt-id :id} {:branch "tag-model-names"}
                 :model/TransformTag _ {:name "shared name"}]
    (testing "a name taken in the main app is free inside a worktree"
      (is (transform-tag/tag-name-exists? "shared name"))
      (is (not (transform-tag/tag-name-exists? "shared name" wt-id))))
    (mt/with-temp [:model/TransformTag _ {:name "shared name" :worktree_id wt-id}]
      (is (transform-tag/tag-name-exists? "shared name" wt-id)))))

(deftest worktree-tag-id-cannot-change-test
  (mt/with-temp [:model/RemoteSyncWorktree {wt-id :id} {:branch "tag-model-pin"}
                 :model/TransformTag {tag-id :id} {:name "main tag"}]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"worktree_id cannot be changed"
                          (t2/update! :model/TransformTag tag-id {:worktree_id wt-id})))))

(deftest creating-a-worktree-tag-is-admin-only-test
  (mt/with-temp [:model/RemoteSyncWorktree {wt-id :id} {:branch "tag-model-perms"}]
    (mt/with-current-user (mt/user->id :rasta)
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that"
                            (t2/insert! :model/TransformTag {:name "sneaky" :worktree_id wt-id}))))))

(deftest tag-assignment-must-match-both-sides-test
  (mt/with-temp [:model/RemoteSyncWorktree {wt-id :id} {:branch "tag-model-assign"}
                 :model/Transform {main-tf :id} {:name "main transform"}
                 :model/Transform {wt-tf :id} {:name "worktree transform" :worktree_id wt-id}
                 :model/TransformTag {main-tag :id} {:name "main tag"}
                 :model/TransformTag {wt-tag :id} {:name "worktree tag" :worktree_id wt-id}]
    (testing "a tag assignment cannot pair a transform and a tag from different worktrees"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot move content into or out of"
                            (t2/insert! :model/TransformTransformTag
                                        {:transform_id wt-tf :tag_id main-tag :worktree_id wt-id :position 0})))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot move content into or out of"
                            (t2/insert! :model/TransformTransformTag
                                        {:transform_id main-tf :tag_id wt-tag :position 0}))))
    (testing "matching sides are fine"
      (mt/with-temp [:model/TransformTransformTag in-worktree {:transform_id wt-tf
                                                               :tag_id       wt-tag
                                                               :worktree_id  wt-id
                                                               :position     0}
                     :model/TransformTransformTag in-main {:transform_id main-tf
                                                           :tag_id       main-tag
                                                           :position     0}]
        (is (= wt-id (:worktree_id in-worktree)))
        (is (nil? (:worktree_id in-main)))))))

(deftest worktree-tag-cannot-be-added-to-a-job-test
  (testing "jobs are main-app only, so a worktree tag can never be attached to one"
    (mt/with-temp [:model/RemoteSyncWorktree {wt-id :id} {:branch "tag-model-job"}
                   :model/TransformTag {wt-tag :id} {:name "worktree tag" :worktree_id wt-id}
                   :model/TransformTag {main-tag :id} {:name "main tag"}
                   :model/TransformJob {job-id :id} {:name "job" :schedule "0 0 0 * * ?"}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot be added to a job"
                            (t2/insert! :model/TransformJobTransformTag {:job_id job-id :tag_id wt-tag :position 0})))
      (testing "a main-app tag is fine"
        (mt/with-temp [:model/TransformJobTransformTag job-tag {:job_id job-id :tag_id main-tag :position 0}]
          (is (some? (:id job-tag))))))))
