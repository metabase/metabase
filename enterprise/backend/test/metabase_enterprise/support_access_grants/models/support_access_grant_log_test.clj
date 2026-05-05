(ns metabase-enterprise.support-access-grants.models.support-access-grant-log-test
  "Tests for SupportAccessGrantLog model, particularly revocation behavior."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.support-access-grants.models.support-access-grant-log :as sag-log]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest no-revoke-when-revoked-at-nil-test
  (testing "Auth identities and sessions are NOT affected when revoked_at remains nil"
    (mt/with-model-cleanup [:model/User]
      (mt/with-temp-env-var-value! [:mb-support-access-grant-email "support@metabase.test"]
        (let [support-user (sag-log/fetch-or-create-support-user!)
              support-user-id (:id support-user)]
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
            (t2/update! :model/SupportAccessGrantLog grant-id {:notes "Updated notes"})
            (is (some? (t2/select-one :model/Session :id session-id))
                "Session should still exist after non-revocation update")
            (is (nil? (:expires_at (t2/select-one :model/AuthIdentity :provider "password" :user_id support-user-id)))
                "Auth identity expires_at should remain unchanged")))))))

(deftest revoke-grant-only-affects-support-user-test
  (testing "Revoking a grant only affects the support user, not other users"
    (mt/with-temp-env-var-value! [:mb-support-access-grant-email "support@metabase.test"]
      (mt/with-model-cleanup [:model/User]
        (let [support-user (sag-log/fetch-or-create-support-user!)
              support-user-id (:id support-user)]
          (mt/with-temp [:model/User {grant-creator-id :id} {}
                         :model/User {other-user-id :id} {}
                         :model/SupportAccessGrantLog {grant-id :id}
                         {:user_id grant-creator-id
                          :ticket_number "TEST-123"
                          :notes "Test grant"
                          :grant_start_timestamp (t/offset-date-time)
                          :grant_end_timestamp (t/plus (t/offset-date-time) (t/hours 1))
                          :revoked_at nil}
                         :model/Session {support-session-id :id}
                         {:id "test-id-0"
                          :user_id support-user-id
                          :session_key "test1"
                          :auth_identity_id (t2/select-one-pk :model/AuthIdentity :user_id support-user-id)}
                         :model/Session {other-session-id :id}
                         {:id "test-id-1"
                          :user_id other-user-id
                          :session_key "test2"
                          :auth_identity_id (t2/select-one-pk :model/AuthIdentity :user_id other-user-id)}]
            (let [revoked-timestamp (t/offset-date-time)]
              (t2/update! :model/SupportAccessGrantLog grant-id {:revoked_at revoked-timestamp})
              (is (nil? (t2/select-one :model/Session :id support-session-id))
                  "Support user session should be deleted")
              (is (some? (t2/select-one :model/Session :id other-session-id))
                  "Other user session should remain")
              (is (some? (:expires_at (t2/select-one :model/AuthIdentity :user_id support-user-id)))
                  "Support user auth identity should have expires_at set")
              (is (nil? (:expires_at (t2/select-one :model/AuthIdentity :user_id other-user-id)))
                  "Other user auth identity should remain unchanged"))))))))
