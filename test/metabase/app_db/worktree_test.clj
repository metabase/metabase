(ns metabase.app-db.worktree-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.worktree.core :as worktree]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel main-app-content-is-invisible-inside-a-worktree-test
  (mt/with-temp [:model/Collection {collection-id :id} {}]
    (testing "the main app reads its own content"
      (is (t2/exists? :model/Collection :id collection-id))
      (is (= 1 (t2/count :model/Collection :id collection-id)))
      (is (some? (t2/select-one :model/Collection :id collection-id))))
    (testing "a worktree reads only what it checked out"
      (worktree/with-worktree Integer/MAX_VALUE
        (is (not (t2/exists? :model/Collection :id collection-id)))
        (is (= 0 (t2/count :model/Collection :id collection-id)))
        (is (nil? (t2/select-one :model/Collection :id collection-id)))))
    (testing "working across worlds sees every world"
      (worktree/with-worktree Integer/MAX_VALUE
        (worktree/across-worlds
         (is (t2/exists? :model/Collection :id collection-id))
         (is (some? (t2/select-one :model/Collection :id collection-id))))))))

(deftest ^:parallel a-worktree-writes-only-to-its-own-world-test
  (mt/with-temp [:model/Collection {collection-id :id} {:name "Worktree scope"}]
    (worktree/with-worktree Integer/MAX_VALUE
      (is (zero? (t2/update! :model/Collection collection-id {:name "Renamed from a worktree"})))
      (is (zero? (t2/delete! :model/Collection :id collection-id))))
    (is (= "Worktree scope" (t2/select-one-fn :name :model/Collection :id collection-id)))))
