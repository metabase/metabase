(ns metabase-enterprise.advanced-permissions.api.channel-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.channel-test :as api.channel-test]
   [metabase.models.permissions :as perms]
   [metabase.test :as mt]))

(comment
 ;; to reigster the :metabase-test channel implementation
 api.channel-test/keepme)

(deftest channel-api-test
  (testing "/api/channel"
    (mt/with-model-cleanup [:model/Channel]
      (mt/with-user-in-groups
        [group {:name "New Group"}
         user  [group]]
        (letfn [(update-channel [user status]
                  (testing (format "set slack setting with %s user" (mt/user-descriptor user))
                    (mt/with-temp [:model/Channel {id :id} {:type "metabase-test"
                                                            :details {:return-type  "return-value"
                                                                      :return-value true}}]
                      (mt/user-http-request user :put status (format "channel/%d" id) {:name (mt/random-name)}))))
                (create-channel [user status]
                  (testing (format "create slack setting with %s user" (mt/user-descriptor user))
                    (mt/user-http-request user :post status "channel" {:name (mt/random-name)
                                                                       :type "metabase-test"
                                                                       :details {:return-type  "return-value"
                                                                                 :return-value true}})))]

          (testing "if `advanced-permissions` is disabled, require admins"
            (mt/with-premium-features #{}
              (create-channel user 403)
              (update-channel user 403)
              (create-channel :crowberto 200)
              (update-channel :crowberto 200)))

          (testing "if `advanced-permissions` is enabled"
            (mt/with-premium-features #{:advanced-permissions}
              (testing "still fail if user's group doesn't have `setting` permission"
                (create-channel user 403)
                (update-channel user 403)
                (create-channel :crowberto 200)
                (update-channel :crowberto 200))

              (testing "succeed if user's group has `setting` permission"
                (perms/grant-application-permissions! group :setting)
                (create-channel user 200)
                (update-channel user 200)
                (create-channel :crowberto 200)
                (update-channel user 200)))))))))
