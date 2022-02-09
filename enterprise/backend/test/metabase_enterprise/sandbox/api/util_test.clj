(ns metabase-enterprise.sandbox.api.util-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.sandbox.api.util :as mt.api.u]
            [metabase.test :as mt]))

(defn- has-segmented-perms-when-segmented-db-exists? [user-kw]
  (mt/with-gtaps-for-user user-kw {:gtaps {:venues {}}}
    (mt.api.u/segmented-user?)))

(deftest never-segment-admins-test
  (testing "Admins should not be classified as segmented users -- enterprise #147"
    (testing "Non-admin"
      (is (= true
             (has-segmented-perms-when-segmented-db-exists? :rasta))))
    (testing "admin"
      (is (=  false
              (has-segmented-perms-when-segmented-db-exists? :crowberto))))))
