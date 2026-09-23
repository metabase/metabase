(ns metabase.app-db.worktree-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.worktree :as mdb.worktree]
   [metabase.test :as mt]
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
