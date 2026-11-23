(ns metabase.oauth-server.models-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as app-db]
   [metabase.events.test-util :as events.tu]
   [metabase.oauth-server.db :as oauth-server.db]
   [metabase.oauth-server.models.oauth-access-token :as oauth-access-token]
   [metabase.oauth-server.models.oauth-authorization-code :as oauth-authorization-code]
   [metabase.oauth-server.models.oauth-refresh-token :as oauth-refresh-token]
   [metabase.test :as mt]
   [metabase.users.access-test-util :as access.tu]
   [metabase.users.models.user :as user]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/User {user-1 :id} {}
                 :model/User {user-2 :id} {}
                 :model/User {user-3 :id} {}
                 :model/User {user-4 :id} {}
                 :model/User {user-5 :id} {}
                 :model/User {user-6 :id} {}]
    (let [user-ids [user-1 user-2 user-3 user-4 user-5 user-6]]
      (doseq [write! [oauth-access-token/revoke-oauth-access-tokens-for-users!
                      oauth-refresh-token/revoke-oauth-refresh-tokens-for-users!
                      (comp oauth-authorization-code/delete-oauth-authorization-codes!
                            oauth-server.db/authorization-code-ids-of-users)]]
        (testing (str write!)
          (let [counted (fn [n] (events.tu/statement-count! #(write! (vec (take n user-ids)))))]
            (counted 1)
            (is (= (counted 2) (counted 6)))))))))

(deftest delete-oauth-authorization-codes-removes-every-code-of-users-test
  (mt/with-temp [:model/User {user-1 :id} {}
                 :model/User {user-2 :id} {}
                 :model/User {other :id}  {}]
    (let [code! (fn [user-id]
                  (oauth-authorization-code/create-oauth-authorization-code!
                   {:code         (str (random-uuid))
                    :user_id      user-id
                    :client_id    "test-client"
                    :redirect_uri "https://example.com/callback"
                    :scope        []
                    :nonce        nil
                    :expiry       (+ (System/currentTimeMillis) 60000)}))]
      (doseq [user-id [user-1 user-1 user-2 other]]
        (code! user-id))
      (is (= 3 (oauth-authorization-code/delete-oauth-authorization-codes!
                (oauth-server.db/authorization-code-ids-of-users [user-1 user-2]))))
      (is (empty? (oauth-server.db/authorization-code-ids-of-users [user-1 user-2])))
      (is (= 1 (count (oauth-server.db/authorization-code-ids-of-users [other])))))))

(deftest deactivation-revokes-every-user-of-event-across-batches-test
  (mt/with-temp [:model/User {user-1 :id} {}
                 :model/User {user-2 :id} {}
                 :model/User {user-3 :id} {}]
    (mt/with-model-cleanup [:model/OAuthAccessToken :model/OAuthAuthorizationCode]
      (let [user-ids [user-1 user-2 user-3]
            accesses (mapv access.tu/give-access! user-ids)]
        (doseq [user-id user-ids]
          (oauth-authorization-code/create-oauth-authorization-code!
           {:code         (str (random-uuid))
            :user_id      user-id
            :client_id    "test-client"
            :redirect_uri "https://example.com/callback"
            :scope        []
            :nonce        nil
            :expiry       (+ (System/currentTimeMillis) 60000)}))
        (with-redefs [app-db/update-partition-size 1
                      app-db/delete-partition-size 1]
          (user/update-users! (mapv #(hash-map :id % :is_active false) user-ids)))
        (testing "every token of every deactivated user is revoked"
          (is (every? :token-revoked? (map access.tu/access-state accesses))))
        (testing "every authorization code of every deactivated user is deleted"
          (is (not (t2/exists? :model/OAuthAuthorizationCode :user_id [:in user-ids]))))))))
