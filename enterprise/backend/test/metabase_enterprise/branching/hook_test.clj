(ns metabase-enterprise.branching.hook-test
  (:require
   [clojure.test :refer :all]
   [metabase.branching.core :as branching]
   [metabase.test :as mt]
   [metabase.util.string :as string]
   [toucan2.core :as t2]))

(deftest insert-cards
  (let [branch1-name (str "branch1-" (string/random-string 5))
        branch2-name (str "branch2-" (string/random-string 5))
        branch1-id (t2/insert-returning-pk! :model/Branch {:name branch1-name})
        _branch2-id (t2/insert-returning-pk! :model/Branch {:name branch2-name})]
    (testing "No branch set"
      (let [no-branch-name (str "no-branch-" (string/random-string 5))
            no-branch-id (t2/insert-returning-pk! :model/Card {:name                   no-branch-name
                                                               :display                "table"
                                                               :dataset_query          "{}"
                                                               :visualization_settings "{}"
                                                               :creator_id             (mt/user->id :rasta)
                                                               :database_id            1})]
        (is (= no-branch-name (:name (t2/select-one (t2/table-name :model/Card) no-branch-id))))
        (is (false? (t2/exists? :model/BranchModelMapping :original_id no-branch-id)))

        (testing "Can see the no-branch from main"
          (is (= no-branch-id (:id (t2/select-one :model/Card :name no-branch-name)))))
        (testing "Can see the no-branch from another branch"
          (branching/with-current-branch-var branch1-name
            (is (= no-branch-id (:id (t2/select-one :model/Card :name no-branch-name))))))

        (testing "Inserting into a branch"
          (branching/with-current-branch-var branch1-name
            (let [card1-id (t2/insert-returning-pk! :model/Card {:name                   "Branch1 Card"
                                                                 :display                "table"
                                                                 :dataset_query          "{}"
                                                                 :visualization_settings "{}"
                                                                 :creator_id             (mt/user->id :rasta)
                                                                 :database_id            1})]
              (is (= "Branch1 Card" (:name (t2/select-one (t2/table-name :model/Card) card1-id))))
              (is (= [[branch1-id card1-id]] (t2/select-fn-vec (juxt :branch_id :original_id) :model/BranchModelMapping :original_id card1-id)))
              (testing "Can select it out while in the branch"
                (is (= no-branch-id (:id (t2/select-one :model/Card :name no-branch-name)))))
              (testing "Can't select it from a different branch"
                (branching/with-current-branch-var branch2-name
                  (is (= 0 (count (t2/select :model/Card :id card1-id)))))))))))))

(deftest update-cares
  (let [branch1-name (str "branch1-" (string/random-string 5))
        branch2-name (str "branch2-" (string/random-string 5))
        branch1-id (t2/insert-returning-pk! :model/Branch {:name branch1-name})
        _branch2-id (t2/insert-returning-pk! :model/Branch {:name branch2-name})
        base-card-id (t2/insert-returning-pk! :model/Card {:name                   "Base Card Version"
                                                           :display                "table"
                                                           :dataset_query          "{}"
                                                           :visualization_settings "{}"
                                                           :creator_id             (mt/user->id :rasta)
                                                           :database_id            1})]
    (testing "No branch set updating"
      (t2/update! (t2/table-name :model/Card) base-card-id {:name "Updated Base Card Version"})

      (is (= "Updated Base Card Version" (:name (t2/select-one (t2/table-name :model/Card) base-card-id))))
      (is (false? (t2/exists? :model/BranchModelMapping :original_id base-card-id)))

      (testing "Can see the change on another branch which has no changes for it"
        (branching/with-current-branch-var branch1-name
          (is (= "Updated Base Card Version" (:name (t2/select-one :model/Card :id base-card-id))))))

      (testing "Updating in a branch by pk"
        (branching/with-current-branch-var branch1-name
          (t2/update! :model/Card base-card-id {:name "Renamed in Branch 1"})
          (is (= "Renamed in Branch 1" (:name (t2/select-one :model/Card :id base-card-id))))
          (is (= [[branch1-id base-card-id]] (t2/select-fn-vec (juxt :branch_id :original_id) :model/BranchModelMapping :original_id base-card-id)))

          (testing "main branch doesn't see the change"
            (branching/with-current-branch-var nil
              (is (= "Updated Base Card Version" (:name (t2/select-one :model/Card :id base-card-id))))))
          (testing "other branch doesn't see the change"
            (branching/with-current-branch-var branch2-name
              (is (= "Updated Base Card Version" (:name (t2/select-one :model/Card :id base-card-id))))))

          (testing "Can update by non-PK"
            (t2/update! :model/Card :name "Renamed in Branch 1" {:name "Renamed by name in Branch 1"})
            (is (= "Renamed by name in Branch 1" (:name (t2/select-one :model/Card :id base-card-id))))
            (branching/with-current-branch-var nil
              (is (= "Updated Base Card Version" (:name (t2/select-one :model/Card :id base-card-id)))))))))))
