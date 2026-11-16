(ns metabase-enterprise.snippet-collections.governing-collection-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]))

(deftest snippets-root-test
  (mt/with-non-admin-groups-no-root-collection-for-namespace-perms :snippets
    (testing "without snippet collections the snippets root has no permissions to check"
      (mt/with-premium-features #{}
        (mt/with-test-user :rasta
          (is (true? (collections/can-read-governing-collection? :snippets nil)))
          (is (true? (collections/can-write-governing-collection? :snippets nil))))))
    (mt/with-premium-features #{:snippet-collections}
      (mt/with-test-user :rasta
        (is (false? (collections/can-read-governing-collection? :snippets nil)))
        (is (false? (collections/can-write-governing-collection? :snippets nil)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"You don't have permissions to do that"
                              (collections/check-write-governing-collection :snippets nil))))
      (perms/grant-collection-read-permissions!
       (perms/all-users-group) (assoc collection.root/root-collection :namespace :snippets))
      (mt/with-test-user :rasta
        (is (true? (collections/can-read-governing-collection? :snippets nil)))
        (is (false? (collections/can-write-governing-collection? :snippets nil)))
        (is (= :snippets (:namespace (collections/check-read-governing-collection :snippets nil))))))))
