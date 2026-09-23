(ns metabase.app-db.worktree-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.worktree :as mdb.worktree]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel main-app-content-is-invisible-inside-a-worktree-test
  (mt/with-temp [:model/Collection {collection-id :id} {}]
    (testing "the main app reads its own content"
      (is (t2/exists? :model/Collection :id collection-id))
      (is (= 1 (t2/count :model/Collection :id collection-id)))
      (is (some? (t2/select-one :model/Collection :id collection-id))))
    (testing "a worktree reads only what it checked out"
      (mdb.worktree/with-worktree Integer/MAX_VALUE
        (is (not (t2/exists? :model/Collection :id collection-id)))
        (is (= 0 (t2/count :model/Collection :id collection-id)))
        (is (nil? (t2/select-one :model/Collection :id collection-id)))))
    (testing "lifting the scoping sees every worktree"
      (mdb.worktree/with-worktree Integer/MAX_VALUE
        (mdb.worktree/without-worktree-scoping
         (is (t2/exists? :model/Collection :id collection-id))
         (is (some? (t2/select-one :model/Collection :id collection-id))))))))

(deftest a-worktree-writes-only-to-its-own-content-test
  (mt/with-temp [:model/Collection {collection-id :id} {:name "Worktree scope"}]
    (mdb.worktree/with-worktree Integer/MAX_VALUE
      (is (zero? (t2/update! :model/Collection collection-id {:name "Renamed from a worktree"})))
      (is (zero? (t2/delete! :model/Collection :id collection-id))))
    (is (= "Worktree scope" (t2/select-one-fn :name :model/Collection :id collection-id)))))

(deftest ^:parallel a-raw-query-is-restricted-by-the-table-it-names-test
  (mt/with-temp [:model/Collection {collection-id :id} {}]
    (letfn [(ids [] (map :id (t2/query {:select [:id] :from [:collection] :where [:= :id collection-id]})))
            (cte-ids [] (map :id (t2/query {:with   [[:mine ^:allow-subquery
                                                      {:select [:id]
                                                       :from   [:collection]
                                                       :where  [:= :id collection-id]}]]
                                            :select [:id]
                                            :from   [:mine]})))]
      (testing "the main app reads its own content"
        (is (= [collection-id] (ids)))
        (is (= [collection-id] (cte-ids))))
      (testing "a worktree reads only what it checked out"
        (mdb.worktree/with-worktree Integer/MAX_VALUE
          (is (empty? (ids)))
          (is (empty? (cte-ids))))))))

(deftest ^:parallel a-query-built-out-of-others-is-restricted-throughout-test
  (mt/with-temp [:model/Collection {collection-id :id} {}]
    (letfn [(union-ids []
              (map :id (t2/query {:select [:id]
                                  :from   [[^:allow-subquery
                                            {:union-all [^:allow-subquery {:select [:id]
                                                                           :from   [[:collection :c]]
                                                                           :where  [:= :c.id collection-id]}
                                                         ^:allow-subquery {:select [:id]
                                                                           :from   [[:collection :c2]]
                                                                           :where  [:= :c2.id collection-id]}]}
                                            :both]]})))
            (subselect-ids []
              (map :id (t2/query {:select [:id]
                                  :from   [[^:allow-subquery {:select [:id]
                                                              :from   [:collection]
                                                              :where  [:= :id collection-id]}
                                            :mine]]})))]
      (testing "the main app reads its own content"
        (is (= [collection-id collection-id] (union-ids)))
        (is (= [collection-id] (subselect-ids))))
      (testing "a worktree reads only what it checked out"
        (mdb.worktree/with-worktree Integer/MAX_VALUE
          (is (empty? (union-ids)))
          (is (empty? (subselect-ids))))))))

(deftest a-personal-collection-belongs-to-the-main-app-test
  (testing "a user working in a worktree keeps the one Personal Collection they have in the main app"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [collection-id (u/the-id (collection/user->personal-collection user-id))]
        (mdb.worktree/with-worktree Integer/MAX_VALUE
          (is (= collection-id (u/the-id (collection/user->personal-collection user-id)))
              "a second one is neither looked for nor created"))
        (is (= 1 (mdb.worktree/without-worktree-scoping
                  (t2/count :model/Collection :personal_owner_id user-id))))))))
