(ns metabase-enterprise.sandbox.api.util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.api.util :as mt.api.u]
   [metabase-enterprise.test :as met]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest enforce-sandbox?-test
  (testing "If a user is in a single group with a sandbox, the sandbox should be enforced"
    (t2.with-temp/with-temp [:model/User user {}]
      (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
        (is (mt.api.u/sandboxed-user?)))))

  (testing "If a user is in another group with view data access, the sandbox should not be enforced"
    (t2.with-temp/with-temp [:model/User user {}]
      (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
        (mt/with-full-data-perms-for-all-users!
          (is (not (mt.api.u/sandboxed-user?))))))))

(defn- has-segmented-perms-when-segmented-db-exists?! [user-kw]
  (testing "User is sandboxed when they are not in any other groups that provide unrestricted access"
      (met/with-gtaps-for-user! user-kw {:gtaps {:venues {}}}
        (mt.api.u/sandboxed-user?))))

(deftest never-segment-admins-test
  (testing "Admins should not be classified as segmented users -- enterprise #147"
    (testing "Non-admin"
      (is (has-segmented-perms-when-segmented-db-exists?! :rasta)))

    (testing "Admin"
      (is (not (has-segmented-perms-when-segmented-db-exists?! :crowberto))))))
