(ns metabase-enterprise.sandbox.api.util-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.sandbox.api.util :as mt.api.u]
            [metabase-enterprise.sandbox.test-util :as mt.tu]
            [metabase.test :as mt]
            [metabase.test.data.users :as test.users]))

(defn- has-segmented-perms-when-segmented-db-exists? [user-kw]
  (mt/with-temp-copy-of-db
    (mt.tu/add-segmented-perms-for-venues-for-all-users-group! (mt/db))
    (test.users/with-test-user user-kw
      (mt.api.u/segmented-user?))))

(deftest never-segment-admins-test
  (testing "Admins should not be classified as segmented users -- enterprise #147"
    (testing "Non-admin"
      (is (= true
             (has-segmented-perms-when-segmented-db-exists? :rasta))))
    (testing "admin"
      (is (=  false
              (has-segmented-perms-when-segmented-db-exists? :crowberto))))))
