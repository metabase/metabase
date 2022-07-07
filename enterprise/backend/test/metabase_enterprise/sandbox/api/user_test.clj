(ns metabase-enterprise.sandbox.api.user-test
  "Tests that would logically be included in `metabase.api.user-test` but are separate as they are enterprise only."
  (:require [clojure.test :refer :all]
            [metabase.models.permissions-group-membership :refer [PermissionsGroupMembership]]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

;; Non-segmented users are allowed to ask for a list of all of the users in the Metabase instance. Pulse email lists
;; are an example usage of this. Segmented users should not have that ability. Instead they should only see
;; themselves. This test checks that GET /api/user for a segmented user only returns themselves
(deftest segmented-user-list-test
  (testing "GET /api/user for a segmented user should return themselves"
    (mt/with-gtaps {:gtaps {:venues {}}}
      ;; Now do the request
      (is (= [{:common_name "Rasta Toucan"
               :last_name   "Toucan"
               :first_name  "Rasta"
               :email       "rasta@metabase.com"
               :id          true}]
             (tu/boolean-ids-and-timestamps ((mt/user-http-request :rasta :get 200 "user") :data))))
      (testing "Should return themselves when the user is a segmented group manager"
        (mt/with-group [group {:name "a group"}]
          (let [membership (db/select-one PermissionsGroupMembership
                                          :group_id (u/the-id group)
                                          :user_id (mt/user->id :rasta))]
            (db/update! PermissionsGroupMembership (:id membership)
              :is_group_manager true))
          (is (= [{:common_name "Rasta Toucan"
                   :last_name   "Toucan"
                   :first_name  "Rasta"
                   :email       "rasta@metabase.com"
                   :id          true}]
                 (tu/boolean-ids-and-timestamps
                  (-> (mt/user-http-request :rasta :get 200
                                            (str "user?group_id=" (u/the-id group)))
                      :data)))))))))
