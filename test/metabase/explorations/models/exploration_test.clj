(ns metabase.explorations.models.exploration-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest exploration-creates-entity-id-test
  (mt/with-temp [:model/User u {}
                 :model/Exploration e {:name "x" :creator_id (:id u)}]
    (is (= 21 (count (:entity_id e))))
    (testing "timestamps are populated"
      (is (some? (:created_at e)))
      (is (some? (:updated_at e))))))

(deftest exploration-can-read-write-test
  (mt/with-temp [:model/User owner {}
                 :model/User other {}
                 :model/Exploration e {:name "x" :creator_id (:id owner)}]
    (testing "owner can read and write"
      (binding [api/*current-user-id* (:id owner) api/*is-superuser?* false]
        (is (true? (mi/can-read?  :model/Exploration (:id e))))
        (is (true? (mi/can-write? :model/Exploration (:id e))))))
    (testing "other user cannot read or write"
      (binding [api/*current-user-id* (:id other) api/*is-superuser?* false]
        (is (false? (mi/can-read?  :model/Exploration (:id e))))
        (is (false? (mi/can-write? :model/Exploration (:id e))))))
    (testing "superuser can read and write"
      (binding [api/*current-user-id* (:id other) api/*is-superuser?* true]
        (is (true? (mi/can-read?  :model/Exploration (:id e))))
        (is (true? (mi/can-write? :model/Exploration (:id e))))))))

(deftest exploration-thread-perms-delegate-to-exploration-test
  (mt/with-temp [:model/User owner {}
                 :model/User other {}
                 :model/Exploration e {:name "x" :creator_id (:id owner)}
                 :model/ExplorationThread t {:exploration_id (:id e)}]
    (binding [api/*current-user-id* (:id owner) api/*is-superuser?* false]
      (is (true? (mi/can-read? :model/ExplorationThread (:id t)))))
    (binding [api/*current-user-id* (:id other) api/*is-superuser?* false]
      (is (false? (mi/can-read? :model/ExplorationThread (:id t)))))))

(deftest published-exploration-uses-collection-perms-test
  (testing "When is_published is true, can-read?/can-write? defer to the parent collection's perms."
    (mt/with-temp [:model/User       owner    {}
                   :model/Card       card     {:type          :metric
                                               :creator_id    (:id owner)
                                               :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Collection coll     {}
                   :model/Exploration e       {:name          "shared"
                                               :creator_id    (:id owner)
                                               :collection_id (:id coll)
                                               :is_published  true}
                   :model/ExplorationThread t {:exploration_id (:id e)}
                   :model/ExplorationQuery  q {:exploration_thread_id (:id t)
                                               :card_id      (:id card)
                                               :dimension_id "d1"
                                               :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/with-non-admin-groups-no-collection-perms (:id coll)
        (testing "user with no collection perms cannot read"
          (mt/with-test-user :rasta
            (is (false? (mi/can-read?  :model/Exploration (:id e))))
            (is (false? (mi/can-write? :model/Exploration (:id e))))
            (is (false? (mi/can-read?  :model/ExplorationThread (:id t))))
            (is (false? (mi/can-read?  :model/ExplorationQuery (:id q))))))
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll)
        (testing "user with collection-read can read but not write"
          (mt/with-test-user :rasta
            (is (true?  (mi/can-read?  :model/Exploration (:id e))))
            (is (false? (mi/can-write? :model/Exploration (:id e))))
            (is (true?  (mi/can-read?  :model/ExplorationThread (:id t))))
            (is (true?  (mi/can-read?  :model/ExplorationQuery (:id q))))))
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll)
        (testing "user with collection-write can read and write"
          (mt/with-test-user :rasta
            (is (true? (mi/can-read?  :model/Exploration (:id e))))
            (is (true? (mi/can-write? :model/Exploration (:id e))))
            (is (true? (mi/can-write? :model/ExplorationThread (:id t))))
            (is (true? (mi/can-write? :model/ExplorationQuery (:id q))))))))))

(deftest unpublished-exploration-stays-creator-only-test
  (testing "is_published=false ignores collection_id and stays creator/admin only."
    (mt/with-temp [:model/User       owner {}
                   :model/Collection coll  {}
                   :model/Exploration e   {:name          "private"
                                           :creator_id    (:id owner)
                                           :collection_id (:id coll)
                                           :is_published  false}]
      (mt/with-non-admin-groups-no-collection-perms (:id coll)
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll)
        (binding [api/*current-user-id* (:id owner) api/*is-superuser?* false]
          (is (true? (mi/can-read?  :model/Exploration (:id e))))
          (is (true? (mi/can-write? :model/Exploration (:id e)))))
        (testing "rasta has full collection perms but still cannot read — exploration is unpublished"
          (mt/with-test-user :rasta
            (is (false? (mi/can-read?  :model/Exploration (:id e))))
            (is (false? (mi/can-write? :model/Exploration (:id e))))))))))

(deftest published-exploration-in-root-collection-uses-root-perms-test
  (testing "is_published=true + collection_id=NULL → root collection perms apply."
    (mt/with-temp [:model/User       owner {}
                   :model/Exploration e   {:name          "root-shared"
                                           :creator_id    (:id owner)
                                           :collection_id nil
                                           :is_published  true}]
      (mt/with-non-admin-groups-no-root-collection-perms
        (testing "no root perms → cannot read"
          (mt/with-test-user :rasta
            (is (false? (mi/can-read?  :model/Exploration (:id e))))))
        (mt/with-temp [:model/PermissionsGroup       g {}
                       :model/PermissionsGroupMembership _ {:group_id (:id g) :user_id (mt/user->id :rasta)}]
          (perms/grant-permissions! (:id g) "/collection/root/read/")
          (testing "root-read granted → can read but not write"
            (mt/with-test-user :rasta
              (is (true?  (mi/can-read?  :model/Exploration (:id e))))
              (is (false? (mi/can-write? :model/Exploration (:id e))))))
          (perms/grant-permissions! (:id g) "/collection/root/")
          (testing "root-write granted → can write"
            (mt/with-test-user :rasta
              (is (true? (mi/can-write? :model/Exploration (:id e)))))))))))

(deftest exploration-thread-json-transforms-test
  (mt/with-temp [:model/User u {}
                 :model/Card metric {:type :metric :creator_id (:id u)}
                 :model/Exploration e {:name "x" :creator_id (:id u)}
                 :model/ExplorationThread t {:exploration_id (:id e)}
                 :model/ExplorationThreadMetric m {:exploration_thread_id (:id t)
                                                   :card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1"
                                                                         :table_id 1
                                                                         :target ["field" {} 1]}]}
                 :model/ExplorationQuery q {:exploration_thread_id (:id t)
                                            :card_id (:id metric)
                                            :dimension_id "d1"
                                            :dataset_query {:database 1 :type :query}}]
    (testing "ExplorationThreadMetric.dimension_mappings round-trips through JSON"
      (let [reread (t2/select-one :model/ExplorationThreadMetric :id (:id m))]
        (is (= "d1" (-> reread :dimension_mappings first :dimension_id)))))
    (testing "ExplorationQuery transforms"
      (let [reread (t2/select-one :model/ExplorationQuery :id (:id q))]
        (is (= "d1" (:dimension_id reread)))
        (is (= 1 (-> reread :dataset_query :database)))))))

(deftest hydrate-threads-on-exploration-test
  (mt/with-temp [:model/User u {}
                 :model/Exploration e {:name "x" :creator_id (:id u)}
                 :model/ExplorationThread _t1 {:exploration_id (:id e) :position 0}
                 :model/ExplorationThread _t2 {:exploration_id (:id e) :position 1}]
    (let [hydrated (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :threads)]
      (is (= 2 (count (:threads hydrated))))
      (is (= [0 1] (mapv :position (:threads hydrated)))))))
