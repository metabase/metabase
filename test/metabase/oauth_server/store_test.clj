(ns metabase.oauth-server.store-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.oauth-server.store :as store]
   [metabase.test :as mt]
   [oidc-provider.protocol :as proto]
   [oidc-provider.util :as oidc-util]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ ClientStore -------------------------------------------------------

(deftest client-store-register-and-get-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [cs          (store/create-client-store)
          secret-hash (oidc-util/hash-client-secret "super-secret")
          config      {:client-id      (str (random-uuid))
                       ;; The library pre-hashes the client secret before calling register-client
                       :client-secret  secret-hash
                       :redirect-uris  ["https://example.com/callback"]
                       :grant-types    ["authorization_code"]
                       :response-types ["code"]
                       :scopes         ["openid" "profile"]}
          result      (proto/register-client cs config)]
      (testing "register-client returns config with client-id"
        (is (= (:client-id config) (:client-id result))))
      (testing "client secret hash is stored"
        (is (=? {:client-secret-hash string?}
                result)))
      (testing "get-client returns only the hash, not plaintext secret"
        (let [fetched (proto/get-client cs (:client-id config))]
          (is (=? {:client-secret-hash string?} fetched))
          (is (nil? (:client-secret fetched)))))
      (testing "get-client returns the registered client"
        (let [fetched (proto/get-client cs (:client-id config))]
          (is (=? {:client-id          (:client-id config)
                   :redirect-uris      ["https://example.com/callback"]
                   :grant-types        ["authorization_code"]
                   :response-types     ["code"]
                   :scopes             ["openid" "profile"]
                   :client-secret-hash string?}
                  fetched))))
      (testing "stored hash verifies against original secret"
        (let [fetched (proto/get-client cs (:client-id config))]
          (is (oidc-util/verify-client-secret "super-secret" (:client-secret-hash fetched))))))))

(deftest client-store-generate-client-id-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [cs     (store/create-client-store)
          config {:redirect-uris  ["https://example.com/callback"]
                  :grant-types    ["authorization_code"]
                  :response-types ["code"]
                  :scopes         ["openid"]}
          result (proto/register-client cs config)]
      (testing "client-id is generated when not provided"
        (is (some? (:client-id result)))
        (is (string? (:client-id result)))))))

(deftest client-store-update-test
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
            (is (= "Updated Name" (:client-name fetched)))))))))

(deftest client-store-get-nonexistent-test
  (let [cs (store/create-client-store)]
    (testing "get-client returns nil for nonexistent client"
      (is (nil? (proto/get-client cs "nonexistent-id"))))))

(deftest client-store-update-nonexistent-test
  (let [cs (store/create-client-store)]
    (testing "update-client returns nil for nonexistent client"
      (is (nil? (proto/update-client cs "nonexistent-id" {:client-name "Nope"}))))))

(deftest client-store-register-public-client-test
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
          (is (= "none" (:token-endpoint-auth-method fetched))))))))

(deftest client-store-registration-access-token-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [cs       (store/create-client-store)
          rat      "my-registration-access-token"
          rat-hash (oidc-util/hash-client-secret rat)
          config   {:client-id                 (str (random-uuid))
                    :redirect-uris             ["https://example.com/callback"]
                    :grant-types               ["authorization_code"]
                    :response-types            ["code"]
                    :scopes                    ["openid"]
                    ;; The library pre-hashes before calling register-client
                    :registration-access-token rat-hash}
          result   (proto/register-client cs config)]
      (testing "register-client stores the hash"
        (is (=? {:registration-access-token-hash string?}
                result)))
      (testing "get-client returns hash under both :registration-access-token-hash and :registration-access-token"
        (let [fetched (proto/get-client cs (:client-id config))]
          (is (=? {:registration-access-token-hash string?
                   :registration-access-token      string?} fetched))
          (is (= (:registration-access-token-hash fetched)
                 (:registration-access-token fetched)))))
      (testing "stored hash verifies against original plaintext token"
        (let [fetched (proto/get-client cs (:client-id config))]
          (is (oidc-util/verify-client-secret rat (:registration-access-token fetched))))))))

;;; ----------------------------------------- AuthorizationCodeStore ---------------------------------------------------

(deftest authorization-code-store-save-and-get-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [acs       (store/create-authorization-code-store)
          code      (str (random-uuid))
          user-id   (mt/user->id :rasta)
          client-id (str (random-uuid))
          expiry    (+ (inst-ms (java.util.Date.)) 600000)]
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
          (is (=? {:user-id               (str user-id)
                   :client-id             client-id
                   :redirect-uri          "https://example.com/callback"
                   :scope                 ["openid" "profile"]
                   :nonce                 "test-nonce"
                   :expiry                expiry
                   :code-challenge        "challenge123"
                   :code-challenge-method "S256"
                   :resource              ["https://api.example.com"]}
                  fetched)))))))

(deftest authorization-code-store-delete-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [acs       (store/create-authorization-code-store)
          code      (str (random-uuid))
          user-id   (mt/user->id :rasta)
          client-id (str (random-uuid))]
      (proto/save-authorization-code acs code user-id client-id
                                     "https://example.com/callback"
                                     ["openid"] nil
                                     (+ (inst-ms (java.util.Date.)) 600000)
                                     nil nil nil)
      (testing "delete-authorization-code returns true"
        (is (true? (proto/delete-authorization-code acs code))))
      (testing "get returns nil after delete"
        (is (nil? (proto/get-authorization-code acs code)))))))

(deftest authorization-code-store-get-nonexistent-test
  (let [acs (store/create-authorization-code-store)]
    (testing "get-authorization-code returns nil for nonexistent code"
      (is (nil? (proto/get-authorization-code acs "nonexistent-code"))))))

(deftest authorization-code-store-consume-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [acs       (store/create-authorization-code-store)
          code      (str (random-uuid))
          user-id   (mt/user->id :rasta)
          client-id (str (random-uuid))
          expiry    (+ (inst-ms (java.util.Date.)) 600000)]
      (proto/save-authorization-code acs code user-id client-id
                                     "https://example.com/callback"
                                     ["openid" "profile"]
                                     "test-nonce"
                                     expiry
                                     "challenge123"
                                     "S256"
                                     ["https://api.example.com"])
      (testing "consume returns the saved code data"
        (let [consumed (proto/consume-authorization-code acs code)]
          (is (=? {:user-id               (str user-id)
                   :client-id             client-id
                   :redirect-uri          "https://example.com/callback"
                   :scope                 ["openid" "profile"]
                   :nonce                 "test-nonce"
                   :expiry                expiry
                   :code-challenge        "challenge123"
                   :code-challenge-method "S256"
                   :resource              ["https://api.example.com"]}
                  consumed))))
      (testing "get returns nil after consume"
        (is (nil? (proto/get-authorization-code acs code))))
      (testing "consuming again returns nil"
        (is (nil? (proto/consume-authorization-code acs code)))))))

(deftest authorization-code-store-consume-race-test
  (testing "concurrent consume calls: exactly one succeeds"
    (let [acs       (store/create-authorization-code-store)
          code      (str (random-uuid))
          user-id   (mt/user->id :rasta)
          client-id (str (random-uuid))
          expiry    (+ (inst-ms (java.util.Date.)) 600000)]
      (proto/save-authorization-code acs code user-id client-id
                                     "https://example.com/callback"
                                     ["openid" "profile"]
                                     "test-nonce"
                                     expiry
                                     "challenge123"
                                     "S256"
                                     ["https://api.example.com"])
      (let [results (->> (repeatedly 10 #(future (proto/consume-authorization-code acs code)))
                         doall
                         (map deref))]
        (is (= 1 (count (filter some? results))))))))

;;; ------------------------------------------------ TokenStore --------------------------------------------------------

(deftest token-store-access-token-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [ts        (store/create-token-store)
          token     (str (random-uuid))
          user-id   (mt/user->id :rasta)
          client-id (str (random-uuid))
          expiry    (+ (inst-ms (java.util.Date.)) 3600000)]
      (testing "save-access-token returns true"
        (is (true? (proto/save-access-token ts token user-id client-id
                                            ["openid" "profile"] expiry
                                            ["https://api.example.com"]))))
      (testing "get-access-token returns the saved token data"
        (let [fetched (proto/get-access-token ts token)]
          (is (=? {:user-id   (str user-id)
                   :client-id client-id
                   :scope     ["openid" "profile"]
                   :expiry    expiry
                   :resource  ["https://api.example.com"]}
                  fetched)))))))

(deftest token-store-refresh-token-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [ts        (store/create-token-store)
          token     (str (random-uuid))
          user-id   (mt/user->id :rasta)
          client-id (str (random-uuid))]
      (testing "save-refresh-token returns true"
        (is (true? (proto/save-refresh-token ts token user-id client-id
                                             ["openid"] nil nil))))
      (testing "get-refresh-token returns the saved token data"
        (let [fetched (proto/get-refresh-token ts token)]
          (is (=? {:user-id   (str user-id)
                   :client-id client-id
                   :scope     ["openid"]}
                  fetched)))))))

(deftest token-store-revoke-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [ts           (store/create-token-store)
          access-tok   (str (random-uuid))
          refresh-tok  (str (random-uuid))
          user-id      (mt/user->id :rasta)
          client-id    (str (random-uuid))
          expiry       (+ (inst-ms (java.util.Date.)) 3600000)]
      (proto/save-access-token ts access-tok user-id client-id ["openid"] expiry nil)
      (proto/save-refresh-token ts refresh-tok user-id client-id ["openid"] nil nil)
      (testing "revoke-token returns true"
        (is (true? (proto/revoke-token ts access-tok)))
        (is (true? (proto/revoke-token ts refresh-tok))))
      (testing "get returns nil after revocation"
        (is (nil? (proto/get-access-token ts access-tok)))
        (is (nil? (proto/get-refresh-token ts refresh-tok)))))))

(deftest token-store-get-nonexistent-test
  (let [ts (store/create-token-store)]
    (testing "get-access-token returns nil for nonexistent token"
      (is (nil? (proto/get-access-token ts "nonexistent"))))
    (testing "get-refresh-token returns nil for nonexistent token"
      (is (nil? (proto/get-refresh-token ts "nonexistent"))))))
