(ns metabase-enterprise.oauth-server.store-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.oauth-server.store :as store]
   [metabase.test :as mt]
   [oidc-provider.protocol :as proto]
   [oidc-provider.util :as oidc-util]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ ClientStore -------------------------------------------------------

(deftest client-store-register-and-get-test
  (mt/with-premium-features #{:metabot-v3}
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [cs     (store/create-client-store)
            config {:client-id      (str (random-uuid))
                    :client-secret  "super-secret"
                    :redirect-uris  ["https://example.com/callback"]
                    :grant-types    ["authorization_code"]
                    :response-types ["code"]
                    :scopes         ["openid" "profile"]}
            result (proto/register-client cs config)]
        (testing "register-client returns config with client-id"
          (is (= (:client-id config) (:client-id result))))
        (testing "client secret is hashed, not stored in plaintext"
          (is (some? (:client-secret-hash result)))
          (is (nil? (:client-secret result))))
        (testing "get-client returns the registered client"
          (let [fetched (proto/get-client cs (:client-id config))]
            (is (= (:client-id config) (:client-id fetched)))
            (is (= ["https://example.com/callback"] (:redirect-uris fetched)))
            (is (= ["authorization_code"] (:grant-types fetched)))
            (is (= ["code"] (:response-types fetched)))
            (is (= ["openid" "profile"] (:scopes fetched)))
            (is (some? (:client-secret-hash fetched)))))
        (testing "stored hash verifies against original secret"
          (let [fetched (proto/get-client cs (:client-id config))]
            (is (oidc-util/verify-client-secret "super-secret" (:client-secret-hash fetched)))))))))

(deftest client-store-generate-client-id-test
  (mt/with-premium-features #{:metabot-v3}
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [cs     (store/create-client-store)
            config {:redirect-uris  ["https://example.com/callback"]
                    :grant-types    ["authorization_code"]
                    :response-types ["code"]
                    :scopes         ["openid"]}
            result (proto/register-client cs config)]
        (testing "client-id is generated when not provided"
          (is (some? (:client-id result)))
          (is (string? (:client-id result))))))))

(deftest client-store-update-test
  (mt/with-premium-features #{:metabot-v3}
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [cs        (store/create-client-store)
            client-id (str (random-uuid))
            config    {:client-id      client-id
                       :redirect-uris  ["https://example.com/callback"]
                       :grant-types    ["authorization_code"]
                       :response-types ["code"]
                       :scopes         ["openid"]
                       :client-name    "Original Name"}]
        (proto/register-client cs config)
        (let [updated (proto/update-client cs client-id {:client-name "Updated Name"})]
          (testing "update-client returns merged config"
            (is (= "Updated Name" (:client-name updated)))
            (is (= ["https://example.com/callback"] (:redirect-uris updated))))
          (testing "get-client reflects the update"
            (let [fetched (proto/get-client cs client-id)]
              (is (= "Updated Name" (:client-name fetched))))))))))

(deftest client-store-get-nonexistent-test
  (mt/with-premium-features #{:metabot-v3}
    (let [cs (store/create-client-store)]
      (testing "get-client returns nil for nonexistent client"
        (is (nil? (proto/get-client cs "nonexistent-id")))))))

(deftest client-store-update-nonexistent-test
  (mt/with-premium-features #{:metabot-v3}
    (let [cs (store/create-client-store)]
      (testing "update-client returns nil for nonexistent client"
        (is (nil? (proto/update-client cs "nonexistent-id" {:client-name "Nope"})))))))

(deftest client-store-register-public-client-test
  (mt/with-premium-features #{:metabot-v3}
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [cs     (store/create-client-store)
            config {:client-id      (str (random-uuid))
                    :redirect-uris  ["https://example.com/callback"]
                    :grant-types    ["authorization_code"]
                    :response-types ["code"]
                    :scopes         ["openid"]
                    :token-endpoint-auth-method "none"}
            result (proto/register-client cs config)]
        (testing "public client has no secret hash"
          (is (nil? (:client-secret-hash result))))
        (testing "get-client returns nil for client-secret-hash"
          (let [fetched (proto/get-client cs (:client-id config))]
            (is (nil? (:client-secret-hash fetched)))
            (is (= "none" (:token-endpoint-auth-method fetched)))))))))

;;; ----------------------------------------- AuthorizationCodeStore ---------------------------------------------------

(deftest authorization-code-store-save-and-get-test
  (mt/with-premium-features #{:metabot-v3}
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [acs       (store/create-authorization-code-store)
            code      (str (random-uuid))
            user-id   (mt/user->id :rasta)
            client-id (str (random-uuid))
            expiry    (+ (System/currentTimeMillis) 600000)]
        (testing "save-authorization-code returns true"
          (is (true? (proto/save-authorization-code acs code user-id client-id
                                                    "https://example.com/callback"
                                                    ["openid" "profile"]
                                                    "test-nonce"
                                                    expiry
                                                    "challenge123"
                                                    "S256"
                                                    ["https://api.example.com"]))))
        (testing "get-authorization-code returns the saved code data"
          (let [fetched (proto/get-authorization-code acs code)]
            (is (= user-id (:user-id fetched)))
            (is (= client-id (:client-id fetched)))
            (is (= "https://example.com/callback" (:redirect-uri fetched)))
            (is (= ["openid" "profile"] (:scope fetched)))
            (is (= "test-nonce" (:nonce fetched)))
            (is (= expiry (:expiry fetched)))
            (is (= "challenge123" (:code-challenge fetched)))
            (is (= "S256" (:code-challenge-method fetched)))
            (is (= ["https://api.example.com"] (:resource fetched)))))))))

(deftest authorization-code-store-delete-test
  (mt/with-premium-features #{:metabot-v3}
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [acs       (store/create-authorization-code-store)
            code      (str (random-uuid))
            user-id   (mt/user->id :rasta)
            client-id (str (random-uuid))]
        (proto/save-authorization-code acs code user-id client-id
                                       "https://example.com/callback"
                                       ["openid"] nil
                                       (+ (System/currentTimeMillis) 600000)
                                       nil nil nil)
        (testing "delete-authorization-code returns true"
          (is (true? (proto/delete-authorization-code acs code))))
        (testing "get returns nil after delete"
          (is (nil? (proto/get-authorization-code acs code))))))))

(deftest authorization-code-store-get-nonexistent-test
  (mt/with-premium-features #{:metabot-v3}
    (let [acs (store/create-authorization-code-store)]
      (testing "get-authorization-code returns nil for nonexistent code"
        (is (nil? (proto/get-authorization-code acs "nonexistent-code")))))))

;;; ------------------------------------------------ TokenStore --------------------------------------------------------

(deftest token-store-access-token-test
  (mt/with-premium-features #{:metabot-v3}
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [ts        (store/create-token-store)
            token     (str (random-uuid))
            user-id   (mt/user->id :rasta)
            client-id (str (random-uuid))
            expiry    (+ (System/currentTimeMillis) 3600000)]
        (testing "save-access-token returns true"
          (is (true? (proto/save-access-token ts token user-id client-id
                                              ["openid" "profile"] expiry
                                              ["https://api.example.com"]))))
        (testing "get-access-token returns the saved token data"
          (let [fetched (proto/get-access-token ts token)]
            (is (= user-id (:user-id fetched)))
            (is (= client-id (:client-id fetched)))
            (is (= ["openid" "profile"] (:scope fetched)))
            (is (= expiry (:expiry fetched)))
            (is (= ["https://api.example.com"] (:resource fetched)))))))))

(deftest token-store-refresh-token-test
  (mt/with-premium-features #{:metabot-v3}
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [ts        (store/create-token-store)
            token     (str (random-uuid))
            user-id   (mt/user->id :rasta)
            client-id (str (random-uuid))]
        (testing "save-refresh-token returns true"
          (is (true? (proto/save-refresh-token ts token user-id client-id
                                               ["openid"] nil))))
        (testing "get-refresh-token returns the saved token data"
          (let [fetched (proto/get-refresh-token ts token)]
            (is (= user-id (:user-id fetched)))
            (is (= client-id (:client-id fetched)))
            (is (= ["openid"] (:scope fetched)))))))))

(deftest token-store-revoke-test
  (mt/with-premium-features #{:metabot-v3}
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [ts           (store/create-token-store)
            access-tok   (str (random-uuid))
            refresh-tok  (str (random-uuid))
            user-id      (mt/user->id :rasta)
            client-id    (str (random-uuid))
            expiry       (+ (System/currentTimeMillis) 3600000)]
        (proto/save-access-token ts access-tok user-id client-id ["openid"] expiry nil)
        (proto/save-refresh-token ts refresh-tok user-id client-id ["openid"] nil)
        (testing "revoke-token returns true"
          (is (true? (proto/revoke-token ts access-tok)))
          (is (true? (proto/revoke-token ts refresh-tok))))
        (testing "get returns nil after revocation"
          (is (nil? (proto/get-access-token ts access-tok)))
          (is (nil? (proto/get-refresh-token ts refresh-tok))))))))

(deftest token-store-get-nonexistent-test
  (mt/with-premium-features #{:metabot-v3}
    (let [ts (store/create-token-store)]
      (testing "get-access-token returns nil for nonexistent token"
        (is (nil? (proto/get-access-token ts "nonexistent"))))
      (testing "get-refresh-token returns nil for nonexistent token"
        (is (nil? (proto/get-refresh-token ts "nonexistent")))))))

;;; ---------------------------------------------- ClaimsProvider ------------------------------------------------------

(deftest claims-provider-openid-only-test
  (mt/with-premium-features #{:metabot-v3}
    (let [cp      (store/create-claims-provider)
          user-id (mt/user->id :rasta)
          claims  (proto/get-claims cp user-id ["openid"])]
      (testing "claims contain :sub"
        (is (= (str user-id) (:sub claims))))
      (testing "no profile or email claims with openid-only scope"
        (is (nil? (:name claims)))
        (is (nil? (:email claims)))))))

(deftest claims-provider-full-scope-test
  (mt/with-premium-features #{:metabot-v3}
    (let [cp      (store/create-claims-provider)
          user-id (mt/user->id :rasta)
          claims  (proto/get-claims cp user-id ["openid" "profile" "email"])]
      (testing "claims contain profile fields"
        (is (some? (:name claims)))
        (is (some? (:preferred_username claims))))
      (testing "claims contain email fields"
        (is (= "rasta@metabase.com" (:email claims)))
        (is (true? (:email_verified claims)))))))

(deftest claims-provider-nonexistent-user-test
  (mt/with-premium-features #{:metabot-v3}
    (let [cp (store/create-claims-provider)]
      (testing "get-claims returns nil for nonexistent user"
        (is (nil? (proto/get-claims cp Integer/MAX_VALUE ["openid"])))))))
