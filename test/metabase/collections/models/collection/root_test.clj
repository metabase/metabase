(ns metabase.collections.models.collection.root-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest perms-test
  (doseq [premium-feature-set [#{} #{:audit-app}]
          [f k]               [[#'mi/can-read? :can_read] [#'mi/can-write? :can_write]]]
    (testing (format "%s with features %s" f (pr-str premium-feature-set))
      (mt/with-premium-features premium-feature-set
        (mt/with-non-admin-groups-no-root-collection-perms
          (testing "a superuser"
            (mt/with-current-user (mt/user->id :crowberto)
              (is (true? (f (t2/hydrate collection.root/root-collection k))))))
          (testing "a user without root permissions"
            (mt/with-current-user (mt/user->id :rasta)
              (is (false? (f (t2/hydrate collection.root/root-collection k))))))
          (testing "a user with root permissions"
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection.root/root-collection)
            (mt/with-current-user (mt/user->id :rasta)
              (is (true? (f (t2/hydrate collection.root/root-collection k)))))))))))

(deftest snippets-root-perms-test
  (testing "The snippets root is open to everyone while EE snippet Collections are off"
    (mt/with-premium-features #{}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-current-user (mt/user->id :rasta)
          (let [root (assoc collection.root/root-collection :namespace :snippets)]
            (is (true? (mi/can-read? (t2/hydrate root :can_read))))
            (is (true? (mi/can-write? (t2/hydrate root :can_write))))))))))
