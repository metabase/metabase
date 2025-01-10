(ns metabase-enterprise.sandbox.api.user-test
  "Tests that would logically be included in `metabase.api.user-test` but are separate as they are enterprise only."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

;; Non-segmented users are allowed to ask for a list of all of the users in the Metabase instance. Pulse email lists
;; are an example usage of this. Segmented users should not have that ability. Instead they should only see
;; themselves. This test checks that GET /api/user/recipients for a segmented user only returns themselves, including
;; for Permissions Group Managers.
(deftest segmented-user-list-test
  (testing "GET /api/user/recipients"
    (testing "sanity check: normally returns more than just me"
      (is (seq (disj (->> (mt/user-http-request :rasta :get 200 "user/recipients")
                          :data
                          (map :email)
                          set)
                     "rasta@metabase.com"))))
    (testing "a sandboxed user will see only themselves"
      (met/with-gtaps! {:gtaps {:venues {}}}
        (is (= ["rasta@metabase.com"]
               (->> (mt/user-http-request :rasta :get 200 "user/recipients")
                    :data
                    (map :email))))
        (testing "... even if they are a group manager"
          (mt/with-premium-features #{:advanced-permissions :sandboxes}
            (let [membership (t2/select-one :model/PermissionsGroupMembership
                                            :group_id (u/the-id &group)
                                            :user_id (mt/user->id :rasta))]
              (t2/update! :model/PermissionsGroupMembership :id (:id membership)
                          {:is_group_manager true}))
            (let [result (mt/user-http-request :rasta :get 200 "user/recipients")]
              (is (= ["rasta@metabase.com"]
                     (map :email (:data result))))
              (is (= 1 (count (:data result))))
              (is (= 1 (:total result))))))))))
