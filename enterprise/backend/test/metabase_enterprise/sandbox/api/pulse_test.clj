(ns metabase-enterprise.sandbox.api.pulse-test
  "Tests that would logically be included in `metabase.api.pulse-test` but are separate as they are enterprise only."
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Card PermissionsGroup PermissionsGroupMembership]]
             [test :as mt]
             [util :as u]]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase-enterprise.sandbox.test-util :as sandbox.tu]
            metabase.integrations.slack))

(comment metabase.integrations.slack/keep-me) ; so the Setting exists

(deftest segmented-users-pulse-test
  (testing "GET /api/pulse/form_input"
    (testing (str "Non-segmented users are able to send pulses to any slack channel that the configured instance can "
                  "see. A segmented user should not be able to send messages to those channels. This tests that a "
                  "segmented user doesn't see any slack channels.")
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
          (mt/with-temporary-setting-values [slack-token nil]
            (is (= nil
                   (-> ((mt/user->client :rasta) :get 200 "pulse/form_input")
                       (get-in [:channels :slack]))))))))))
