(ns metabase.collections.create-test
  "Tests for creating a collection in its parent, which the collection hooks fill and check."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.create :as collections.create]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest apply-defaults-to-collection-test
  (testing "Location reflects the parent path"
    (mt/with-temp [:model/Collection parent {:name "Path Parent"}]
      (is (= (str "/" (:id parent) "/")
             (:location (collections.create/apply-defaults-to-collection
                         {:name "Path Child" :parent_id (:id parent)}))))))
  (testing "Without a parent the collection is in the root"
    (is (= "/" (:location (collections.create/apply-defaults-to-collection {:name "Root Child"})))))
  (testing "Columns the parent decides are left to the collection hooks"
    (mt/with-temp [:model/Collection parent {:name "RS Parent" :is_remote_synced true :namespace "snippets"}]
      (let [defaulted (collections.create/apply-defaults-to-collection
                       {:name "RS Child" :parent_id (:id parent)})]
        (is (not (contains? defaulted :is_remote_synced)))
        (is (not (contains? defaulted :type)))
        (is (not (contains? defaulted :namespace)))))))

(deftest create-collection!-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "A child takes its namespace and remote-synced flag from its parent"
      (mt/with-temp [:model/Collection parent {:name "Persist Parent" :is_remote_synced true}]
        (let [coll (collections.create/create-collection!
                    {:name "Persist Child" :parent_id (:id parent)})]
          (try
            (is (=? {:name "Persist Child" :is_remote_synced true :location (str "/" (:id parent) "/")}
                    (t2/select-one :model/Collection :id (:id coll))))
            (finally
              (t2/delete! :model/Collection :id (:id coll)))))))
    (testing "A child takes its namespace from its parent"
      (mt/with-temp [:model/Collection parent {:name "Snippet Parent" :namespace "snippets"}]
        (let [coll (collections.create/create-collection!
                    {:name "Snippet Child" :parent_id (:id parent)})]
          (try
            (is (= :snippets (t2/select-one-fn :namespace :model/Collection :id (:id coll))))
            (finally
              (t2/delete! :model/Collection :id (:id coll)))))))
    (testing "A namespace other than the one of the parent is refused"
      (mt/with-temp [:model/Collection parent {:name "Snippet Parent 2" :namespace "snippets"}]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"same namespace as its parent"
                              (collections.create/create-collection!
                               {:name "Explicit NS Child" :parent_id (:id parent) :namespace "analytics"})))))))
