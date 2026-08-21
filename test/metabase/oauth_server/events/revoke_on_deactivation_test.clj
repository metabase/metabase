(ns metabase.oauth-server.events.revoke-on-deactivation-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.events.core :as events]
   [metabase.oauth-server.events.revoke-on-deactivation] ; for side effects: registers the event subscriber
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- in-one-hour [] (+ (inst-ms (java.util.Date.)) 3600000))

(defn- insert-access-token! [user-id]
  (let [token (str (random-uuid))]
    (t2/insert! :model/OAuthAccessToken {:token     token
                                         :user_id   user-id
                                         :client_id "test-client"
                                         :scope     ["openid"]
                                         :expiry    (in-one-hour)})
    token))

(defn- insert-refresh-token! [user-id]
  (let [token (str (random-uuid))]
    (t2/insert! :model/OAuthRefreshToken {:token     token
                                          :user_id   user-id
                                          :client_id "test-client"
                                          :scope     ["openid"]})
    token))

(defn- revoked? [model token]
  (some? (t2/select-one-fn :revoked_at model :token token)))

(deftest revoke-on-event-test
  (testing ":event/user-credentials-revoked revokes the user's OAuth tokens, leaving other users' untouched"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [victim           (mt/user->id :rasta)
            bystander        (mt/user->id :lucky)
            victim-access    (insert-access-token! victim)
            victim-refresh   (insert-refresh-token! victim)
            bystander-access (insert-access-token! bystander)]
        (events/publish-event! :event/user-credentials-revoked {:user-id victim})
        (is (revoked? :model/OAuthAccessToken victim-access)
            "victim's access token is revoked")
        (is (revoked? :model/OAuthRefreshToken victim-refresh)
            "victim's refresh token is revoked")
        (is (not (revoked? :model/OAuthAccessToken bystander-access))
            "an unrelated user's token is untouched")))))

(deftest deactivation-revokes-and-reactivation-does-not-revive-test
  (testing "deactivating a user revokes their OAuth tokens; reactivating does NOT un-revoke them (SEC-863)"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [user-id      (mt/user->id :rasta)
            access-token (insert-access-token! user-id)]
        (is (not (revoked? :model/OAuthAccessToken access-token))
            "token is live while the user is active")
        (t2/update! :model/User user-id {:is_active false})
        (is (revoked? :model/OAuthAccessToken access-token)
            "deactivation revokes the token")
        (let [revoked-at (t2/select-one-fn :revoked_at :model/OAuthAccessToken :token access-token)]
          (t2/update! :model/User user-id {:is_active true})
          (is (= revoked-at (t2/select-one-fn :revoked_at :model/OAuthAccessToken :token access-token))
              "reactivation does not un-revoke the pre-deactivation token"))))))
