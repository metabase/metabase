(ns metabase-enterprise.advanced-permissions.api.util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.api.util
    :as advanced-perms.api.u]
   [metabase-enterprise.advanced-permissions.test-util
    :as advanced-perms.tu]
   [metabase.api.common :as api]
   [metabase.test :as mt]))

(deftest impersonated-user-test
  (testing "Returns true when a user has an active connection impersonation policy"
    (advanced-perms.tu/with-impersonations {:impersonations [{:db-id (mt/id) :attribute "KEY"}]
                                            :attributes     {"KEY" "VAL"}}
      (is (advanced-perms.api.u/impersonated-user?))))

  (testing "Returns true if current user is a superuser, even if they are in a group with an impersonatino policy in place"
    (advanced-perms.tu/with-impersonations-for-user :crowberto {:impersonations [{:db-id (mt/id) :attribute "KEY"}]
                                                                :attributes     {"KEY" "VAL"}}
      (is (not (advanced-perms.api.u/impersonated-user?)))))

  (testing "An exception is thrown if no user is bound"
    (binding [api/*current-user-id* nil]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"No current user found"
                            (advanced-perms.api.u/impersonated-user?))))))
