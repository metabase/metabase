(ns metabase-enterprise.sandbox.api.user-test
  "Tests that would logically be included in `metabase.api.user-test` but are separate as they are enterprise only."
  (:require [clojure.test :refer :all]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase-enterprise.sandbox.test-util :as sandbox.tu]
            [metabase.models
             [card :refer [Card]]
             [permissions-group :as perms-group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]]
            [metabase.test
             [fixtures :as fixtures]
             [util :as tu]]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

;; Non-segmented users are allowed to ask for a list of all of the users in the Metabase instance. Pulse email lists
;; are an example usage of this. Segmented users should not have that ability. Instead they should only see
;; themselves. This test checks that GET /api/user for a segmented user only returns themselves
(deftest segmented-user-list-test
  (testing "GET /api/user"
    (mt/with-temp-copy-of-db
      (mt/with-temp* [Card [{card-id :id :as card} {:name          "magic"
                                                    :dataset_query {:database (u/get-id (mt/db))
                                                                    :type     :native
                                                                    :native   {:query         "SELECT * FROM VENUES WHERE category_id = {{cat}}"
                                                                               :template_tags {:cat {:name "cat" :display_name "cat" :type "number" :required true}}}}}]
                      PermissionsGroup [{group-id :id} {:name "Restricted Venues"}]
                      PermissionsGroupMembership [_ {:group_id group-id
                                                     :user_id  (mt/user->id :rasta)}]
                      GroupTableAccessPolicy [gtap {:group_id             group-id
                                                    :table_id             (mt/id :venues)
                                                    :card_id              card-id
                                                    :attribute_remappings {:cat ["variable" ["template-tag" "cat"]]}}]]

        (sandbox.tu/add-segmented-perms-for-venues-for-all-users-group! (mt/db))
        ;; Now do the request
        (is (= [{:common_name "Rasta Toucan", :last_name "Toucan", :first_name "Rasta", :email "rasta@metabase.com", :id true}]
               (tu/boolean-ids-and-timestamps ((mt/user->client :rasta) :get 200 "user"))))))))
