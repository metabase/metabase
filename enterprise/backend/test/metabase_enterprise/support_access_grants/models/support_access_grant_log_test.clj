(ns metabase-enterprise.support-access-grants.models.support-access-grant-log-test
  "Tests for SupportAccessGrantLog model, particularly revocation behavior."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.support-access-grants.models.support-access-grant-log :as sag-log]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest no-revoke-when-revoked-at-nil-test
  (testing "Auth identities and sessions are NOT affected when revoked_at remains nil"
    (mt/with-model-cleanup [:model/User]
      (mt/with-temp-env-var-value! [:mb-support-access-grant-email "support@metabase.test"]
        (let [support-user (sag-log/fetch-or-create-support-user!)
              support-user-id (:id support-user)]
          (auth-identity/set-password! support-user-id "test-password")
          (mt/with-temp [:model/User {grant-creator-id :id} {}
                         :model/SupportAccessGrantLog {grant-id :id}
                         {:user_id grant-creator-id
                          :ticket_number "TEST-123"
                          :notes "Test grant"
                          :grant_start_timestamp (t/offset-date-time)
                          :grant_end_timestamp (t/plus (t/offset-date-time) (t/hours 1))
                          :revoked_at nil}
                         :model/Session {session-id :id}
                         {:id "test-id-0"
                          :user_id support-user-id
                          :session_key "test1"
                          :auth_identity_id (t2/select-one-pk :model/AuthIdentity :user_id support-user-id)}]
            (t2/update! :model/SupportAccessGrantLog :id grant-id {:notes "Updated notes"})
            (is (nil? (t2/select-one-fn :ended_at :model/Session :id session-id))
                "Session should still be live after non-revocation update")
            (is (nil? (:expires_at (t2/select-one :model/AuthIdentity :provider "password" :user_id support-user-id)))
                "Auth identity expires_at should remain unchanged")))))))

(deftest revoke-grant-only-affects-support-user-test
  (testing "Revoking a grant only affects the support user, not other users"
    (mt/with-temp-env-var-value! [:mb-support-access-grant-email "support@metabase.test"]
      (mt/with-model-cleanup [:model/User]
        (let [support-user (sag-log/fetch-or-create-support-user!)
              support-user-id (:id support-user)]
          (auth-identity/set-password! support-user-id "test-password")
          (mt/with-temp [:model/User {grant-creator-id :id} {}
                         :model/User {other-user-id :id} {}
                         :model/SupportAccessGrantLog {grant-id :id}
                         {:user_id grant-creator-id
                          :ticket_number "TEST-123"
                          :notes "Test grant"
                          :grant_start_timestamp (t/offset-date-time)
                          :grant_end_timestamp (t/plus (t/offset-date-time) (t/hours 1))
                          :revoked_at nil}]
            (auth-identity/set-password! other-user-id "test-password")
            (mt/with-temp [:model/Session {support-session-id :id}
                           {:id "test-id-0"
                            :user_id support-user-id
                            :session_key "test1"
                            :auth_identity_id (t2/select-one-pk :model/AuthIdentity
                                                                :user_id support-user-id
                                                                :provider "password")}
                           :model/Session {other-session-id :id}
                           {:id "test-id-1"
                            :user_id other-user-id
                            :session_key "test2"
                            :auth_identity_id (t2/select-one-pk :model/AuthIdentity
                                                                :user_id other-user-id
                                                                :provider "password")}]
              (let [revoked-timestamp (t/offset-date-time)]
                (t2/update! :model/SupportAccessGrantLog :id grant-id {:revoked_at         revoked-timestamp
                                                                       :revoked_by_user_id grant-creator-id})
                (is (=? {:end_reason "support-grant-revoked", :ended_by_user_id grant-creator-id, :key_hashed nil}
                        (t2/select-one :model/Session :id support-session-id))
                    "Support user session should be ended, attributed to the revoker, and its key destroyed")
                (is (nil? (t2/select-one-fn :ended_at :model/Session :id other-session-id))
                    "Other user session should remain live")
                (is (some? (:expires_at (t2/select-one :model/AuthIdentity
                                                       :user_id support-user-id :provider "password")))
                    "Support user auth identity should have expires_at set")
                (is (nil? (:expires_at (t2/select-one :model/AuthIdentity :user_id other-user-id :provider "password")))
                    "Other user auth identity should remain unchanged")))))))))

(deftest revoked-at-frozen-once-set-test
  (mt/with-temp [:model/SupportAccessGrantLog {grant-id :id :as grant}
                 {:user_id               (mt/user->id :crowberto)
                  :ticket_number         "TEST-456"
                  :grant_start_timestamp (t/offset-date-time)
                  :grant_end_timestamp   (t/plus (t/offset-date-time) (t/hours 1))
                  :revoked_at            (t/offset-date-time)
                  :revoked_by_user_id    (mt/user->id :crowberto)}]
    (testing "plain update cannot clear revocation"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Grant is already revoked"
                            (t2/update! :model/SupportAccessGrantLog :id grant-id {:revoked_at nil}))))
    (testing "plain update cannot revoke again"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Grant is already revoked"
                            (t2/update! :model/SupportAccessGrantLog :id grant-id
                                        {:revoked_at         (t/plus (t/offset-date-time) (t/minutes 5))
                                         :revoked_by_user_id (mt/user->id :rasta)}))))
    (is (= (select-keys grant [:revoked_at :revoked_by_user_id])
           (t2/select-one [:model/SupportAccessGrantLog :revoked_at :revoked_by_user_id] :id grant-id)))))

(deftest update-of-revoked-grant-keeps-active-grant-access-test
  (mt/with-model-cleanup [:model/User]
    (mt/with-temp-env-var-value! [:mb-support-access-grant-email "support@metabase.test"]
      (let [support-user-id (:id (sag-log/fetch-or-create-support-user!))]
        (auth-identity/set-password! support-user-id "test-password")
        (mt/with-temp [:model/User {creator-id :id} {:is_superuser true}
                       :model/SupportAccessGrantLog {old-grant-id :id}
                       {:user_id               creator-id
                        :ticket_number         "TEST-OLD"
                        :grant_start_timestamp (t/minus (t/offset-date-time) (t/hours 2))
                        :grant_end_timestamp   (t/plus (t/offset-date-time) (t/hours 1))
                        :revoked_at            (t/minus (t/offset-date-time) (t/hours 1))
                        :revoked_by_user_id    creator-id}
                       :model/SupportAccessGrantLog {active-grant-id :id}
                       {:user_id               creator-id
                        :ticket_number         "TEST-ACTIVE"
                        :grant_start_timestamp (t/offset-date-time)
                        :grant_end_timestamp   (t/plus (t/offset-date-time) (t/hours 1))}
                       :model/Session {session-id :id}
                       {:id               "test-id-0"
                        :user_id          support-user-id
                        :session_key      "test1"
                        :auth_identity_id (t2/select-one-pk :model/AuthIdentity :user_id support-user-id :provider "password")}]
          (testing "notes update of old revoked grant leaves support user access alone"
            (t2/update! :model/SupportAccessGrantLog :id old-grant-id {:notes "Updated notes"})
            (is (true? (t2/select-one-fn :is_superuser :model/User :id support-user-id)))
            (is (nil? (t2/select-one-fn :ended_at :model/Session :id session-id)))
            (is (nil? (t2/select-one-fn :expires_at :model/AuthIdentity :user_id support-user-id :provider "password"))))
          (testing "revoking active grant tears support user access down"
            (t2/update! :model/SupportAccessGrantLog :id active-grant-id {:revoked_at         (t/offset-date-time)
                                                                          :revoked_by_user_id creator-id})
            (is (false? (t2/select-one-fn :is_superuser :model/User :id support-user-id)))
            (is (=? {:end_reason "support-grant-revoked" :ended_by_user_id creator-id}
                    (t2/select-one :model/Session :id session-id)))
            (is (some? (t2/select-one-fn :expires_at :model/AuthIdentity :user_id support-user-id :provider "password")))))))))
