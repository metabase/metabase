(ns metabase.explorations.models.exploration-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- venues-count-query
  "A `:metric` card's `:dataset_query`: count over the venues table, built with Lib."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(deftest exploration-creates-entity-id-test
  (mt/with-temp [:model/User u {}
                 :model/Exploration e {:name "x" :creator_id (:id u)}]
    (is (= 21 (count (:entity_id e))))
    (testing "timestamps are populated"
      (is (some? (:created_at e)))
      (is (some? (:updated_at e))))))

(deftest exploration-collection-id-test
  (testing "omitting :collection_id leaves the exploration in the root collection"
    (mt/with-temp [:model/User u {}
                   :model/Exploration e {:name "x" :creator_id (:id u)}]
      (is (nil? (:collection_id e)))))
  (testing "explicit :collection_id is respected (including nil for root)"
    (mt/with-temp [:model/User       u {}
                   :model/Collection c {}
                   :model/Exploration explicit  {:name "y" :creator_id (:id u) :collection_id (:id c)}
                   :model/Exploration root-expl {:name "z" :creator_id (:id u) :collection_id nil}]
      (is (= (:id c) (:collection_id explicit)))
      (is (nil? (:collection_id root-expl))))))

(deftest exploration-in-personal-collection-is-creator-only-test
  (testing "an exploration in the creator's Personal Collection is private to creator + admins"
    (mt/with-temp [:model/User owner {}
                   :model/User other {}
                   :model/Exploration e {:name          "x"
                                         :creator_id    (:id owner)
                                         :collection_id (:id (collection/user->personal-collection (:id owner)))}]
      (testing "owner can read and write"
        (mt/with-current-user (:id owner)
          (is (true? (mi/can-read?  :model/Exploration (:id e))))
          (is (true? (mi/can-write? :model/Exploration (:id e))))))
      (testing "other user cannot read or write"
        (mt/with-current-user (:id other)
          (is (false? (mi/can-read?  :model/Exploration (:id e))))
          (is (false? (mi/can-write? :model/Exploration (:id e))))))
      (testing "superuser can read and write"
        (mt/with-test-user :crowberto
          (is (true? (mi/can-read?  :model/Exploration (:id e))))
          (is (true? (mi/can-write? :model/Exploration (:id e)))))))))

(deftest exploration-thread-perms-delegate-to-exploration-test
  (mt/with-temp [:model/User owner {}
                 :model/User other {}
                 :model/Exploration e {:name          "x"
                                       :creator_id    (:id owner)
                                       :collection_id (:id (collection/user->personal-collection (:id owner)))}
                 :model/ExplorationThread t {:exploration_id (:id e)}]
    (mt/with-current-user (:id owner)
      (is (true? (mi/can-read? :model/ExplorationThread (:id t)))))
    (mt/with-current-user (:id other)
      (is (false? (mi/can-read? :model/ExplorationThread (:id t)))))))

(deftest exploration-in-shared-collection-uses-collection-perms-test
  (testing "When an exploration lives in a shared collection, can-read?/can-write? use that collection's perms."
    (mt/with-temp [:model/User       owner    {}
                   :model/Card       card     {:type          :metric
                                               :creator_id    (:id owner)
                                               :dataset_query (venues-count-query)}
                   :model/Collection coll     {}
                   :model/Exploration e       {:name          "shared"
                                               :creator_id    (:id owner)
                                               :collection_id (:id coll)}
                   :model/ExplorationThread t {:exploration_id (:id e)}
                   :model/ExplorationThreadGroup g {:exploration_thread_id (:id t)}
                   :model/ExplorationQuery  q {:exploration_thread_id (:id t)
                                               :group_id     (:id g)
                                               :card_id      (:id card)
                                               :dimension_id "d1"
                                               :dataset_query (venues-count-query)}]
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

(deftest exploration-in-root-collection-uses-root-perms-test
  (testing "collection_id=NULL → root collection perms apply."
    (mt/with-temp [:model/User       owner {}
                   :model/Exploration e   {:name          "root-shared"
                                           :creator_id    (:id owner)
                                           :collection_id nil}]
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
                 :model/ExplorationThreadGroup m {:exploration_thread_id (:id t)
                                                  :metrics [{:card_id (:id metric)
                                                             :dimension_mappings [{:dimension_id "d1"
                                                                                   :table_id 1
                                                                                   :target ["field" {} 1]}]}]}
                 :model/ExplorationQuery q {:exploration_thread_id (:id t)
                                            :card_id (:id metric)
                                            :dimension_id "d1"
                                            :group_id (:id m)
                                            :dataset_query {:database 1 :type :query}}]
    (testing "ExplorationThreadGroup.metrics dimension_mappings round-trips through JSON"
      (let [reread (t2/select-one :model/ExplorationThreadGroup :id (:id m))]
        (is (= "d1" (-> reread :metrics first :dimension_mappings first :dimension_id)))))
    (testing "ExplorationQuery transforms"
      (let [reread (t2/select-one :model/ExplorationQuery :id (:id q))]
        (is (= "d1" (:dimension_id reread)))
        (is (= 1 (-> reread :dataset_query :database)))))))

(deftest exploration-is-searchable-test
  (testing "an exploration is indexed and returned from the default search"
    (when (search/supports-index?)
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Collection  coll {}
                       :model/Exploration e {:name "searchable-research" :collection_id (:id coll)}]
          (letfn [(research-hits [user]
                    (->> (search.tu/search-results "searchable-research"
                                                   {:search-engine   "appdb"
                                                    :current-user-id (mt/user->id user)})
                         (filter (comp #{"searchable-research"} :name))
                         (mapv (juxt :model :id))))]
            (search.ingestion/update!
             (#'search.ingestion/query->documents
              (#'search.ingestion/spec-index-reducible "exploration" [:= :this.id (:id e)]))
             [])
            (testing "a user who can read the collection finds it"
              (is (= [["exploration" (:id e)]] (research-hits :crowberto))))
            (testing "a user without collection perms does not"
              (mt/with-non-admin-groups-no-collection-perms coll
                (is (= [] (research-hits :rasta)))))))))))

(deftest hydrate-threads-on-exploration-test
  (mt/with-temp [:model/User u {}
                 :model/Exploration e {:name "x" :creator_id (:id u)}
                 :model/ExplorationThread _t1 {:exploration_id (:id e) :position 0}
                 :model/ExplorationThread _t2 {:exploration_id (:id e) :position 1}]
    (let [hydrated (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :threads)]
      (is (= 2 (count (:threads hydrated))))
      (is (= [0 1] (mapv :position (:threads hydrated)))))))
