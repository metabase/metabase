(ns metabase.server.middleware.session-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase.api-keys.core :as api-key]
   [metabase.api.common :refer [*current-user* *current-user-id* *is-group-manager?* *is-superuser?*]]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.server.db :as server.db]
   [metabase.server.middleware.session :as mw.session]
   [metabase.session.core :as session]
   [metabase.session.events.revoke-on-deactivation] ; for side effects: deletes sessions on deactivation
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :as i18n]
   [metabase.util.password :as u.password]
   [metabase.util.secret :as u.secret]
   [ring.mock.request :as ring.mock]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(def ^:private session-cookie request/metabase-session-cookie)
(def ^:private session-timeout-cookie request/metabase-session-timeout-cookie)

(def ^:private test-session-key "092797dd-a82a-4748-b393-697d7bb9ab65")
(def ^:private test-session-key-hashed (session/hash-session-key test-session-key))
(def ^:private test-session-id "abcd1234")

(deftest session-deactivation-revokes-test
  (init-status/set-complete!)
  (testing "deactivating the user deletes the session; reactivating does NOT revive it (SEC-863)"
    (mt/with-temp [:model/User {user-id :id} {:is_active true}]
      (let [session-key (str (random-uuid))]
        (t2/insert! (t2/table-name :model/Session)
                    {:id         (session/generate-session-id)
                     :key_hashed (session/hash-session-key session-key)
                     :user_id    user-id
                     :created_at :%now})
        (testing "session authenticates while the user is active"
          (is (some? (#'mw.session/current-user-info-for-session session-key nil))))
        (t2/update! :model/User user-id {:is_active false})
        (testing "after deactivation the session no longer authenticates"
          (is (nil? (#'mw.session/current-user-info-for-session session-key nil))))
        (t2/update! :model/User user-id {:is_active true})
        (testing "after reactivation the same session STILL does not authenticate"
          (is (nil? (#'mw.session/current-user-info-for-session session-key nil))))))))

(deftest session-expired-test
  (init-status/set-complete!)
  (testing "Session expiration time = 1 minute"
    (mt/with-temporary-setting-values [mfa-enforcement :off]
      (with-redefs [env/env (assoc env/env :max-session-age "1")]
        (doseq [[created-at expected msg]
                [[:%now                                                            false "brand-new session"]
                 [#t "1970-01-01T00:00:01Z"                                        true  "really old session"]
                 [(h2x/add-interval-honeysql-form (mdb/db-type) :%now -61 :second) true  "session that is 61 seconds old"]
                 [(h2x/add-interval-honeysql-form (mdb/db-type) :%now -59 :second) false "session that is 59 seconds old"]]]
          (testing (format "\n%s %s be expired." msg (if expected "SHOULD" "SHOULD NOT"))
            (mt/with-temp [:model/User {user-id :id}]
              (let [session-id (session/generate-session-id)
                    session-key (str (random-uuid))
                    session-key-hashed (session/hash-session-key session-key)]
                (t2/insert! (t2/table-name :model/Session) {:id session-id :key_hashed session-key-hashed, :user_id user-id, :created_at created-at})
                (let [session (#'mw.session/current-user-info-for-session session-key nil)]
                  (if expected
                    (is (nil? session))
                    (is (some? session))))))))))))

(defn- insert-test-session!
  "Insert a `core_session` row directly, bypassing the model hooks so that columns like `created_at` and `expires_at`
  can be set to arbitrary (including DB-side) expressions. Returns the plaintext session key."
  [user-id extra-cols]
  (let [session-key (str (random-uuid))]
    (t2/insert! (t2/table-name :model/Session)
                (merge {:id         (session/generate-session-id)
                        :key_hashed (session/hash-session-key session-key)
                        :user_id    user-id}
                       extra-cols))
    session-key))

(deftest session-expires-at-test
  (init-status/set-complete!)
  (testing "`expires_at` is enforced server-side, even for a session well within `max-session-age`"
    (let [db-type (mdb/db-type)
          now     (h2x/current-datetime-honeysql-form db-type)]
      (doseq [[expires-at expected msg]
              [[nil                                                    false "session with no expires_at"]
               [(h2x/add-interval-honeysql-form db-type now 60 :second) false "session that expires in 60 seconds"]
               [(h2x/add-interval-honeysql-form db-type now -1 :second) true  "session that expired 1 second ago"]
               [#t "1970-01-01T00:00:01Z"                              true  "session that expired long ago"]]]
        (testing (format "\n%s %s be expired." msg (if expected "SHOULD" "SHOULD NOT"))
          (mt/with-temp [:model/User {user-id :id}]
            (let [session-key (insert-test-session! user-id {:created_at now, :expires_at expires-at})
                  session     (#'mw.session/current-user-info-for-session session-key nil)]
              (if expected
                (is (nil? session))
                (is (some? session))))))))))

;;; ---------------------------------------- TEST wrap-session-key middleware -----------------------------------------

(def ^:private session-header @#'mw.session/metabase-session-header)

;; create a simple example of our middleware wrapped around a handler that simply returns the request
;; this works in this case because the only impact our middleware has is on the request
(defn- wrapped-handler [request]
  ((mw.session/wrap-session-key
    (fn [request respond _] (respond request)))
   request
   identity
   (fn [e] (throw e))))

(deftest ^:parallel no-session-key-in-request-test
  (testing "no session-key in the request"
    (is (= nil
           (-> (wrapped-handler (ring.mock/request :get "/anyurl"))
               :metabase-session-key)))))

(deftest ^:parallel header-test
  (testing "extract session-key from header"
    (is (= "foobar"
           (:metabase-session-key
            (wrapped-handler
             (ring.mock/header (ring.mock/request :get "/anyurl") session-header "foobar")))))))

(deftest ^:parallel cookie-test
  (testing "extract session-key from cookie"
    (is (= "cookie-session"
           (:metabase-session-key
            (wrapped-handler
             (assoc (ring.mock/request :get "/anyurl")
                    :cookies {session-cookie {:value "cookie-session"}})))))))

(deftest ^:parallel both-header-and-cookie-test
  (testing "if both header and cookie session-keys exist, then we expect the header to take precedence"
    (is (= "foobar"
           (:metabase-session-key
            (wrapped-handler
             (assoc (ring.mock/header (ring.mock/request :get "/anyurl") session-header "foobar")
                    :cookies {session-cookie {:value "cookie-session"}})))))))

(def ^:private test-anti-csrf-token "84482ddf1bb178186ed9e1c0b1e05a2d")

(deftest ^:parallel anti-csrf-headers-test
  (testing "`wrap-session-key` should handle anti-csrf headers they way we'd expect"
    (let [request (-> (ring.mock/request :get "/anyurl")
                      (assoc :cookies {request/metabase-embedded-session-cookie {:value test-session-key}})
                      (assoc-in [:headers request/anti-csrf-token-header] test-anti-csrf-token))]
      (is (= {:anti-csrf-token     "84482ddf1bb178186ed9e1c0b1e05a2d"
              :cookies             {request/metabase-embedded-session-cookie {:value "092797dd-a82a-4748-b393-697d7bb9ab65"}}
              :metabase-session-key "092797dd-a82a-4748-b393-697d7bb9ab65"
              :uri                 "/anyurl"}
             (select-keys (wrapped-handler request) [:anti-csrf-token :cookies :metabase-session-key :uri]))))))

(defn- with-session-for
  "Insert a session with `session-key` for `user-kw`, run `thunk`, then clean up."
  [user-kw session-key thunk]
  (let [session-id (session/generate-session-id)]
    (try
      (t2/insert! :model/Session {:id         session-id
                                  :key_hashed (session/hash-session-key session-key)
                                  :user_id    (mt/user->id user-kw)})
      (thunk)
      (finally
        (t2/delete! :model/Session :id session-id)))))

(deftest session-header-takes-precedence-over-cookie-test
  (init-status/set-complete!)
  (testing "the X-Metabase-Session header wins over a session cookie that also resolves"
    (let [cookie-session-key (str (random-uuid))
          header-session-key (str (random-uuid))]
      (with-session-for
        :crowberto cookie-session-key
        (fn []
          (with-session-for
            :lucky header-session-key
            (fn []
              (let [request (-> (ring.mock/request :get "/anyurl")
                                (ring.mock/header session-header header-session-key)
                                (assoc :cookies {session-cookie {:value cookie-session-key}}))
                    request' (#'mw.session/merge-current-user-info (wrapped-handler request))]
                (is (= (mt/user->id :lucky)
                       (:metabase-user-id request')))
                (testing "\nthe request carries the header's session, not the cookie's"
                  (is (= header-session-key (:metabase-session-key request')))
                  (is (nil? (:metabase-session-type request'))))))))))))

(deftest stale-cookie-does-not-shadow-session-header-test
  (init-status/set-complete!)
  (testing "a session cookie that no longer resolves should not shadow a valid X-Metabase-Session header"
    (let [header-session-key (str (random-uuid))
          stale-cookie-key   (str (random-uuid))]
      (with-session-for
        :lucky header-session-key
        (fn []
          (let [request (-> (ring.mock/request :get "/anyurl")
                            (ring.mock/header session-header header-session-key)
                            (assoc :cookies {session-cookie {:value stale-cookie-key}}))
                request' (#'mw.session/merge-current-user-info (wrapped-handler request))]
            (is (= (mt/user->id :lucky)
                   (:metabase-user-id request')))
            (is (= header-session-key (:metabase-session-key request')))))))))

(deftest stale-session-header-does-not-fall-back-to-cookie-test
  (init-status/set-complete!)
  (testing "a session header that no longer resolves does not borrow the cookie's identity"
    (let [cookie-session-key (str (random-uuid))
          stale-header-key   (str (random-uuid))]
      (with-session-for
        :crowberto cookie-session-key
        (fn []
          (let [request (-> (ring.mock/request :get "/anyurl")
                            (ring.mock/header session-header stale-header-key)
                            (assoc :cookies {session-cookie {:value cookie-session-key}}))
                request' (#'mw.session/merge-current-user-info (wrapped-handler request))]
            (is (nil? (:metabase-user-id request')))))))))

(deftest cookie-used-when-no-session-header-test
  (init-status/set-complete!)
  (testing "with no header on the request the session cookie still authenticates"
    (let [cookie-session-key (str (random-uuid))]
      (with-session-for
        :crowberto cookie-session-key
        (fn []
          (let [request (assoc (ring.mock/request :get "/anyurl")
                               :cookies {session-cookie {:value cookie-session-key}})
                request' (#'mw.session/merge-current-user-info (wrapped-handler request))]
            (is (= (mt/user->id :crowberto)
                   (:metabase-user-id request')))
            (is (= :normal (:metabase-session-type request')))))))))

(deftest no-valid-session-key-test
  (init-status/set-complete!)
  (testing "when neither the cookie nor the header resolves, the request stays unauthenticated"
    (let [request (-> (ring.mock/request :get "/anyurl")
                      (ring.mock/header session-header (str (random-uuid)))
                      (assoc :cookies {session-cookie {:value (str (random-uuid))}}))
          request' (#'mw.session/merge-current-user-info (wrapped-handler request))]
      (is (nil? (:metabase-user-id request'))))))

(deftest current-user-info-for-api-key-test
  (mt/with-temp [:model/ApiKey _ {:name                  "An API Key"
                                  :user_id               (mt/user->id :lucky)
                                  :creator_id            (mt/user->id :lucky)
                                  :updated_by_id         (mt/user->id :lucky)
                                  ::api-key/unhashed-key (u.secret/secret "mb_foobar123")}]
    (testing "A valid API key works, and user info is added to the request"
      (let [req {:headers {"x-api-key" "mb_foobar123"}}]
        (testing "No premium features, do not include :is-group-manager?"
          (mt/with-premium-features #{}
            (is (= (merge req {:metabase-user-id        (mt/user->id :lucky)
                               :is-superuser?           false
                               :is-data-analyst?        false
                               :user-locale             nil
                               :embedding/auth-method   "api-key"})
                   (#'mw.session/merge-current-user-info req)))))
        (testing "Include :is-group-manager? if we have EE + :advanced-permissions "
          (when config/ee-available?
            (mt/with-premium-features #{:advanced-permissions}
              (is (= (merge req {:metabase-user-id        (mt/user->id :lucky)
                                 :is-superuser?           false
                                 :is-data-analyst?        false
                                 :is-group-manager?       false
                                 :user-locale             nil
                                 :embedding/auth-method   "api-key"})
                     (#'mw.session/merge-current-user-info req))))))))))

(deftest api-key-hash-encrypted-at-rest-test
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (encryption-test/with-secret-key "0B9cD6++AME+A7/oR7Y2xvPRHX3cHA2z7w+LbObd/9Y="
      (mt/with-temp [:model/ApiKey {api-key-id :id} {:name                  "Encrypted API Key"
                                                     :user_id               (mt/user->id :lucky)
                                                     :creator_id            (mt/user->id :lucky)
                                                     :updated_by_id         (mt/user->id :lucky)
                                                     ::api-key/unhashed-key (u.secret/secret "mb_encrypted123")}]
        (testing "the stored bcrypt hash is encrypted at rest"
          ;; select from the raw table to bypass the model's decrypting :out transform
          (let [raw (t2/select-one-fn :key :api_key :id api-key-id)]
            (is (encryption/possibly-encrypted-string? raw)
                "raw column value should be ciphertext")
            (is (not (encryption/possibly-encrypted-string? (encryption/maybe-decrypt raw)))
                "it should decrypt to the (plaintext) bcrypt hash")))
        (testing "a valid key still authenticates (middleware decrypts the raw hash before the bcrypt compare)"
          (is (= (mt/user->id :lucky)
                 (:metabase-user-id (#'mw.session/merge-current-user-info {:headers {"x-api-key" "mb_encrypted123"}})))))
        (testing "a plaintext bcrypt hash injected via direct SQL is rejected, even though it is a correct hash of the key"
          (t2/query {:update :api_key
                     :set    {:key (u.password/hash-bcrypt "mb_encrypted123")}
                     :where  [:= :id api-key-id]})
          (is (nil? (:metabase-user-id (#'mw.session/merge-current-user-info {:headers {"x-api-key" "mb_encrypted123"}})))
              "strict decrypt rejects the unencrypted hash")
          ;; restore a properly-encrypted hash so `with-temp` cleanup (whose before-delete reads the row) doesn't hit the
          ;; strict decrypt on the corrupted plaintext value
          (t2/query {:update :api_key
                     :set    {:key (encryption/maybe-encrypt (u.password/hash-bcrypt "mb_encrypted123"))}
                     :where  [:= :id api-key-id]}))))))

(deftest ^:parallel current-user-info-for-api-key-test-1b
  (testing "Various invalid API keys do not modify the request"
    (are [req] (= req (#'mw.session/merge-current-user-info req))
      ;; a matching prefix, invalid key
      {:headers {"x-api-key" "mb_fooby"}}

      ;; no matching prefix, invalid key
      {:headers {"x-api-key" "abcde"}}

      ;; no key at all
      {:headers {}})))

(deftest ^:parallel current-user-info-for-api-key-log-errors-test
  (testing "Log an error about invalid API keys"
    (mt/with-log-messages-for-level [messages [metabase.server.middleware.session :error]]
      (#'mw.session/merge-current-user-info {:headers {"x-api-key" "mb_fooby"}})
      (is (= [{:namespace 'metabase.server.middleware.session
               :level     :error
               :e         nil
               :message   "Ignoring invalid API Key: [\"should be at least 12 characters\"]"}]
             (messages))))))

(deftest ^:parallel current-user-info-for-api-key-log-errors-test-2
  (testing "Do not include the key itself in the error message -- fall back to a generic error message"
    (mt/with-log-messages-for-level [messages [metabase.server.middleware.session :error]]
      (#'mw.session/merge-current-user-info {:headers {"x-api-key" "characters"}})
      (is (= [{:namespace 'metabase.server.middleware.session
               :level     :error
               :e         nil
               :message   "Ignoring invalid API Key"}]
             (messages))))))

(deftest api-key-lifecycle-follows-synthetic-user-not-creator-test
  (testing "an API key is gated by its own synthetic user, not the admin who created it (SEC-863)"
    (mt/with-temp [:model/User  {synthetic-id :id} {}
                   :model/User  {creator-id :id}   {}
                   :model/ApiKey _ {:name                  "An API Key"
                                    :user_id               synthetic-id
                                    :creator_id            creator-id
                                    :updated_by_id         creator-id
                                    ::api-key/unhashed-key (u.secret/secret "mb_foobar123")}]
      (let [authed? (fn [] (mt/with-premium-features #{}
                             (boolean (:metabase-user-id
                                       (#'mw.session/merge-current-user-info {:headers {"x-api-key" "mb_foobar123"}})))))]
        (testing "authenticates while its synthetic user is active"
          (is (authed?)))
        (testing "deactivating the creator does NOT revoke the key — creator_id is attribution only"
          (t2/update! :model/User creator-id {:is_active false})
          (is (authed?)))
        (testing "deactivating the key's own synthetic user DOES revoke it"
          (t2/update! :model/User synthetic-id {:is_active false})
          (is (not (authed?))))))))

(deftest ^:parallel current-user-info-for-api-key-test-2
  (mt/with-temp [:model/ApiKey _ {:name                  "An API Key without an internal user"
                                  :user_id               nil
                                  :creator_id            (mt/user->id :lucky)
                                  :updated_by_id         (mt/user->id :lucky)
                                  ::api-key/unhashed-key (u.secret/secret "mb_foobar123")}]
    (testing "An API key without an internal user (e.g. a SCIM key) should not modify the request"
      (let [req {:headers {"x-api-key" "mb_foobar123"}}]
        (is (= req (#'mw.session/merge-current-user-info req)))))))

(defn- simple-auth-handler
  "A handler that just does authentication and returns a map from the dynamic variables that are bound as a result."
  [request]
  (let [handler (fn [_ respond _]
                  (respond
                   {:user-id           *current-user-id*
                    :is-superuser?     *is-superuser?*
                    :is-group-manager? *is-group-manager?*
                    :user              (select-keys @*current-user* [:id :email])}))]
    ((-> handler
         mw.session/bind-current-user
         mw.session/wrap-current-user-info)
     request
     identity
     (fn [e] (throw e)))))

(deftest ^:parallel user-data-is-correctly-bound-for-api-keys
  (mt/with-temp [:model/ApiKey _ {:name                  "An API Key"
                                  :user_id               (mt/user->id :lucky)
                                  :creator_id            (mt/user->id :lucky)
                                  :updated_by_id         (mt/user->id :lucky)
                                  ::api-key/unhashed-key (u.secret/secret "mb_foobar123")}
                 :model/ApiKey _ {:name                  "A superuser API Key"
                                  :user_id               (mt/user->id :crowberto)
                                  :creator_id            (mt/user->id :lucky)
                                  :updated_by_id         (mt/user->id :lucky)
                                  ::api-key/unhashed-key (u.secret/secret "mb_superuser")}]
    (testing "A valid API key works, and user info is added to the request"
      (is (= {:is-superuser?     false
              :is-group-manager? false
              :user-id           (mt/user->id :lucky)
              :user              {:id    (mt/user->id :lucky)
                                  :email (:email (mt/fetch-user :lucky))}}
             (simple-auth-handler {:headers {"x-api-key" "mb_foobar123"}}))))
    (testing "A superuser API key has `*is-superuser?*` bound correctly"
      (is (= {:is-superuser?     true
              :is-group-manager? false
              :user-id           (mt/user->id :crowberto)
              :user              {:id    (mt/user->id :crowberto)
                                  :email (:email (mt/fetch-user :crowberto))}}
             (simple-auth-handler {:headers {"x-api-key" "mb_superuser"}}))))))

(deftest cannot-use-session-id-for-auth
  (testing "The session id is checked on requests, but only for uuid-formatted keys. Allowing users to auth with core_session.id values would be a security risk."
    (try
      (t2/insert! :model/Session {:id         test-session-id
                                  :key_hashed test-session-key-hashed
                                  :user_id    (mt/user->id :lucky)})
      (is (= nil (#'mw.session/current-user-info-for-session test-session-id nil)))
      (finally
        (t2/delete! :model/Session :id test-session-id)))))

(deftest current-user-info-for-session-test
  (testing "make sure the `current-user-info-for-session` logic is working correctly"
    ;; for some reason Toucan seems to be busted with models with non-integer IDs and `with-temp` doesn't seem to work
    ;; the way we'd expect :/
    (mt/with-temporary-setting-values [mfa-enforcement :off]
      (try
        (t2/insert! :model/Session {:id         test-session-id
                                    :key_hashed test-session-key-hashed
                                    :user_id    (mt/user->id :lucky)})
        (is (= {:metabase-user-id (mt/user->id :lucky),
                :is-superuser? false,
                :is-group-manager? false,
                :user-locale nil
                :is-data-analyst? false
                :auth-provider nil}
               (#'mw.session/current-user-info-for-session test-session-key nil)))
        (finally
          (t2/delete! :model/Session :id test-session-id))))))

(deftest current-user-info-for-session-test-2
  (testing "superusers should come back as `:is-superuser?`"
    (mt/with-temporary-setting-values [mfa-enforcement :off]
      (try
        (t2/insert! :model/Session {:id         test-session-id
                                    :key_hashed test-session-key-hashed
                                    :user_id    (mt/user->id :crowberto)})
        (is (= {:metabase-user-id (mt/user->id :crowberto),
                :is-superuser? true,
                :is-group-manager? false,
                :user-locale nil
                :is-data-analyst? false
                :auth-provider nil}
               (#'mw.session/current-user-info-for-session test-session-key nil)))
        (finally
          (t2/delete! :model/Session :id test-session-id))))))

(deftest current-user-info-for-session-test-3
  (testing "If user is a group manager of at least one group, `:is-group-manager?` "
    (mt/with-temporary-setting-values [mfa-enforcement :off]
      (try
        (mt/with-user-in-groups [group-1 {:name "New Group 1"}
                                 group-2 {:name "New Group 2"}
                                 user    [group-1 group-2]]
          (t2/update! :model/PermissionsGroupMembership {:user_id (:id user), :group_id (:id group-2)}
                      {:is_group_manager true})
          (t2/insert! :model/Session {:id         test-session-id
                                      :key_hashed test-session-key-hashed
                                      :user_id    (:id user)})
          (testing "is `false` if advanced-permisison is disabled"
            (mt/with-premium-features #{}
              (is (= false
                     (:is-group-manager? (#'mw.session/current-user-info-for-session test-session-key nil))))))
          (testing "is `true` if advanced-permisison is enabled"
            ;; a trick to run this test in OSS because even if advanced-permisison is enabled but EE ns is not evailable
            ;; `enable-advanced-permissions?` will still return false
            (mt/with-dynamic-fn-redefs [premium-features/enable-advanced-permissions? (fn [& _args] true)]
              (is (true?
                   (:is-group-manager? (#'mw.session/current-user-info-for-session test-session-key nil)))))))
        (finally
          (t2/delete! :model/Session :id test-session-id))))))

(deftest current-user-info-for-session-test-4
  (mt/with-temporary-setting-values [mfa-enforcement :off]
    (testing "full-app-embed sessions shouldn't come back if we don't explicitly specifiy the anti-csrf token"
      (try
        (t2/insert! :model/Session {:id              test-session-id
                                    :key_hashed      test-session-key-hashed
                                    :user_id         (mt/user->id :lucky)
                                    :anti_csrf_token test-anti-csrf-token})
        (is (= nil
               (#'mw.session/current-user-info-for-session test-session-key nil)))
        (finally
          (t2/delete! :model/Session :id test-session-id)))
      (testing "...but if we do specifiy the token, they should come back"
        (try
          (t2/insert! :model/Session {:id              test-session-id
                                      :key_hashed      test-session-key-hashed
                                      :user_id         (mt/user->id :lucky)
                                      :anti_csrf_token test-anti-csrf-token})
          (is (= {:metabase-user-id (mt/user->id :lucky),
                  :is-superuser? false,
                  :is-group-manager? false,
                  :user-locale nil
                  :is-data-analyst? false
                  :auth-provider nil}
                 (#'mw.session/current-user-info-for-session test-session-key test-anti-csrf-token)))
          (finally
            (t2/delete! :model/Session :id test-session-id)))
        (testing "(unless the token is wrong)"
          (try
            (t2/insert! :model/Session {:id              test-session-id
                                        :key_hashed      test-session-key-hashed
                                        :user_id         (mt/user->id :lucky)
                                        :anti_csrf_token test-anti-csrf-token})
            (is (= nil
                   (#'mw.session/current-user-info-for-session test-session-key (str/join (reverse test-anti-csrf-token)))))
            (finally
              (t2/delete! :model/Session :id test-session-id))))))))

(deftest current-user-info-for-session-test-5
  (testing "if we specify an anti-csrf token we shouldn't get back a session without that token"
    (try
      (t2/insert! :model/Session {:id         test-session-id
                                  :key_hashed test-session-key-hashed
                                  :user_id    (mt/user->id :lucky)})
      (is (= nil
             (#'mw.session/current-user-info-for-session test-session-key test-anti-csrf-token)))
      (finally
        (t2/delete! :model/Session :id test-session-id)))))

(deftest current-user-info-for-session-test-6
  (testing "shouldn't fetch expired sessions"
    (mt/with-temporary-setting-values [mfa-enforcement :off]
      (try
        (t2/insert! :model/Session {:id         test-session-id
                                    :key_hashed test-session-key-hashed
                                    :user_id    (mt/user->id :lucky)})
        ;; use low-level `execute!` because updating is normally disallowed for Sessions
        (t2/query-one {:update (t2/table-name :model/Session), :set {:created_at (t/instant 1000)}, :where [:= :id test-session-id]})
        (is (= nil
               (#'mw.session/current-user-info-for-session test-session-key nil)))
        (finally
          (t2/delete! :model/Session :id test-session-id))))))

(deftest current-user-info-for-session-test-7
  (testing "shouldn't fetch sessions for inactive users"
    (mt/with-temporary-setting-values [mfa-enforcement :off]
      (try
        (t2/insert! :model/Session {:id test-session-id :key_hashed test-session-key-hashed, :user_id (mt/user->id :trashbird)})
        (is (= nil
               (#'mw.session/current-user-info-for-session test-session-key nil)))
        (finally
          (t2/delete! :model/Session :id test-session-id))))))

(deftest auth-provider-via-left-join-test
  (testing "session LEFT JOIN on auth_identity returns correct provider for each auth method"
    (mt/with-temporary-setting-values [mfa-enforcement :off]
      (mt/with-temp [:model/User {user-id :id} {}]
        ;; "password" is excluded - its before-insert hook requires credentials, and it's already
        ;; tested via auth-method-test in view_log_test.clj. "api-key" is tested above in
        ;; current-user-info-for-api-key-test (different code path, no auth_identity).
        (doseq [provider ["jwt" "saml" "google" "ldap" "oidc"
                          "custom-oidc" "slack-connect" "support-access-grant"]]
          (testing (str "provider: " provider)
            (let [ai         (first (t2/insert-returning-instances! (t2/table-name :model/AuthIdentity)
                                                                    {:user_id     user-id
                                                                     :provider    provider
                                                                     :provider_id (str user-id "-" provider)
                                                                     :created_at  :%now
                                                                     :updated_at  :%now}))
                  session-key (session/generate-session-key)
                  session-id  (session/generate-session-id)]
              (try
                (t2/insert! (t2/table-name :model/Session)
                            {:id                session-id
                             :key_hashed        (session/hash-session-key session-key)
                             :user_id           user-id
                             :auth_identity_id  (:id ai)
                             :created_at        :%now})
                (is (= provider
                       (:auth-provider (#'mw.session/current-user-info-for-session session-key nil))))
                (finally
                  (t2/delete! :model/Session :id session-id)
                  (t2/delete! :model/AuthIdentity :id (:id ai)))))))))))

;; create a simple example of our middleware wrapped around a handler that simply returns our bound variables for users
(defn- user-bound-handler [request]
  ((mw.session/bind-current-user
    (fn [_ respond _]
      (respond
       {:user-id *current-user-id*
        :user    (select-keys @*current-user* [:id :email])})))
   request
   identity
   (fn [e] (throw e))))

(defn- request-with-user-id
  "Creates a mock Ring request with the given user-id applied"
  [user-id]
  (-> (ring.mock/request :get "/anyurl")
      (assoc :metabase-user-id user-id)))

(deftest ^:parallel add-user-id-key-test
  (testing "with valid user-id"
    (is (= {:user-id (mt/user->id :rasta)
            :user    {:id    (mt/user->id :rasta)
                      :email (:email (mt/fetch-user :rasta))}}
           (user-bound-handler
            (request-with-user-id (mt/user->id :rasta)))))))

(deftest ^:parallel add-user-id-key-test-2
  (testing "with invalid user-id (not sure how this could ever happen, but lets test it anyways)"
    (is (= {:user-id Integer/MAX_VALUE
            :user    {}}
           (user-bound-handler
            (request-with-user-id Integer/MAX_VALUE))))))

;;; ----------------------------------------------   with-current-user -------------------------------------------------

(deftest bind-locale-test
  (mt/with-temporary-setting-values [mfa-enforcement :off]
    (let [handler        (-> (fn [_ respond _]
                               (respond i18n/*user-locale*))
                             mw.session/bind-current-user
                             mw.session/wrap-current-user-info)
          session-locale (fn [session-key & {:as more}]
                           (handler
                            (merge {:metabase-session-key session-key} more)
                            identity
                            (fn [e] (throw e))))]
      (testing "No Session"
        (is (= nil
               (session-locale nil))))
      (testing "w/ Session"
        (testing "for user with no `:locale`"
          (mt/with-temp [:model/User {user-id :id}]
            (let [session-id (session/generate-session-id)
                  session-key (str (random-uuid))
                  session-key-hashed (session/hash-session-key session-key)]
              (t2/insert! :model/Session {:id session-id :key_hashed session-key-hashed, :user_id user-id})
              (is (= nil
                     (session-locale session-key)))
              (testing "w/ X-Metabase-Locale header"
                (is (= "es_MX"
                       (session-locale session-key :headers {"x-metabase-locale" "es-mx"})))))))
        (testing "for user *with* `:locale`"
          (mt/with-temp [:model/User {user-id :id} {:locale "es-MX"}]
            (let [session-id (session/generate-session-id)
                  session-key (str (random-uuid))
                  session-key-hashed (session/hash-session-key session-key)]
              (t2/insert! :model/Session {:id session-id :key_hashed session-key-hashed, :user_id user-id, :created_at :%now})
              (is (= "es_MX"
                     (session-locale session-key)))
              (testing "w/ X-Metabase-Locale header"
                (is (= "en_GB"
                       (session-locale session-key :headers {"x-metabase-locale" "en-GB"})))))))))))

(deftest session-timeout-test
  (let [request-time (t/zoned-date-time "2022-01-01T00:00:00.000Z")
        session-key   "8df268ab-00c0-4b40-9413-d66b966b696a"
        response     {:body    "some body",
                      :cookies {}}]
    (testing "non-nil `session-timeout-seconds` should set the expiry of the timeout cookie relative to the request time"
      (mt/with-temporary-setting-values [session-timeout {:amount 60
                                                          :unit   "minutes"}
                                         mfa-enforcement :off]
        (testing "with normal sessions"
          (let [request {:cookies               {request/metabase-session-cookie         {:value "8df268ab-00c0-4b40-9413-d66b966b696a"}
                                                 request/metabase-session-timeout-cookie {:value "alive"}}
                         :metabase-session-key   session-key
                         :metabase-session-type :normal}]
            (is (= {:body    "some body",
                    :cookies {session-timeout-cookie {:value     "alive"
                                                      :same-site :lax
                                                      :path      "/"
                                                      :expires   "Sat, 1 Jan 2022 01:00:00 GMT"}}}
                   (mw.session/reset-session-timeout* request response request-time)))))
        (testing "with embedded sessions"
          (let [request {:cookies               {request/metabase-embedded-session-cookie {:value "8df268ab-00c0-4b40-9413-d66b966b696a"}
                                                 request/metabase-session-timeout-cookie  {:value "alive"}}
                         :metabase-session-key   session-key
                         :metabase-session-type :full-app-embed}]
            (is (= {:body    "some body",
                    :cookies {session-timeout-cookie {:value     "alive"
                                                      :path      "/"
                                                      :expires   "Sat, 1 Jan 2022 01:00:00 GMT"}}}
                   (mw.session/reset-session-timeout* request response request-time)))))))))

(deftest session-timeout-test-2
  (let [request-time (t/zoned-date-time "2022-01-01T00:00:00.000Z")
        response     {:body    "some body",
                      :cookies {}}]
    (testing "If the request does not have session cookies (because they have expired), they should not be reset."
      (mt/with-temporary-setting-values [session-timeout {:amount 60
                                                          :unit   "minutes"}
                                         mfa-enforcement :off]
        (let [request {:cookies {}}]
          (is (= response
                 (mw.session/reset-session-timeout* request response request-time))))))))

;;; ---------------------------------------- server-side session timeout tests -----------------------------------------
;; Tests for session-timeout-enforces-last-active-at, session-timeout-falls-back-to-created-at, and
;; session-activity-update-throttle are in metabase-enterprise.api.session-test because they require EE features.

(deftest session-timeout-requires-premium-feature-test
  (init-status/set-complete!)
  (mt/with-premium-features #{}
    (mt/with-temporary-setting-values [session-timeout {:amount 5 :unit "minutes"}
                                       mfa-enforcement :off]
      (mt/with-temp [:model/User {user-id :id}]
        (let [session-id  (session/generate-session-id)
              session-key (str (random-uuid))
              key-hashed  (session/hash-session-key session-key)]
          (t2/insert! (t2/table-name :model/Session)
                      {:id session-id :key_hashed key-hashed :user_id user-id :created_at :%now
                       :last_active_at (h2x/add-interval-honeysql-form (mdb/db-type) :%now -600 :second)})
          (is (some? (#'mw.session/current-user-info-for-session session-key nil))))))))

(deftest auth-method-test
  (testing "auth-method prefers route-based override on special routes"
    (let [f #'mw.session/auth-method]
      (are [session-info api-key-info oauth-info mcp-ui-info embedding-route expected]
           (= expected (f session-info api-key-info oauth-info mcp-ui-info embedding-route))
        ;; session-based auth on non-special routes
        {:auth-provider "password"} nil nil nil nil            "password"
        {:auth-provider "saml"}     nil nil nil nil            "saml"
        {:auth-provider "jwt"}      nil nil nil nil            "jwt"
        {:auth-provider "ldap"}     nil nil nil nil            "ldap"
        {}                          nil nil nil nil            "session"
        ;; api-key on non-special route
        nil                         {}  nil nil nil            "api-key"
        ;; oauth bearer on non-special route
        nil                         nil {:metabase-user-id 1} nil nil "oauth"
        ;; mcp-ui credential on non-special route
        nil                         nil nil {:metabase-user-id 1} nil "mcp-ui"
        ;; route override: special routes win over credentials
        nil                         {}  nil nil "guest-embed"  "guest"   ; api-key + embed -> guest
        nil                         nil nil nil "guest-embed"  "guest"   ; anon guest embed
        nil                         nil nil nil "public"       "public"
        nil                         nil nil nil "metabot"      "metabot"
        nil                         nil nil nil "agent-api"    "agent-api"
        ;; fully anonymous, non-special route
        nil                         nil nil nil nil            nil))))

(defn session-valid?
  [session-key]
  (boolean (#'mw.session/current-user-info-for-session session-key nil)))

(defn- generate-session!
  [user-id auth-identity-id & {:keys [mfa_auth_identity_id]}]
  (let [session-id (session/generate-session-id)
        session-key (str (random-uuid))
        session-key-hashed (session/hash-session-key session-key)]
    (t2/insert! :model/Session {:id session-id
                                :key_hashed session-key-hashed
                                :user_id user-id
                                :auth_identity_id auth-identity-id
                                :mfa_auth_identity_id mfa_auth_identity_id})
    session-key))

(defn generate-mfa-session!
  [user-id auth-identity-id]
  (let [totp-auth-identity-id (t2/insert! :model/AuthIdentity {:user_id  user-id
                                                               :provider "totp"})]
    (generate-session! user-id
                       auth-identity-id
                       :mfa_auth_identity_id totp-auth-identity-id)))

(defn- generate-session-and-get-user-info!
  [user-id auth-identity-id]
  (let [session-key (generate-session! user-id auth-identity-id)
        session     (#'mw.session/current-user-info-for-session session-key nil)]
    session))

(deftest mfa-password-test
  (testing "password"
    (testing "With feature flag off, password works"
      (mt/with-premium-features
       #{}
        (mt/with-temp
          [:model/User {user-id :id} {}]
          (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id)
                session       (generate-session-and-get-user-info! user-id (:id auth-identity))]
            (is (some? session))))))
    (testing "When you lose access to the feature, MFA doesn't apply anymore."
      (mt/when-ee-evailable
       (mt/with-premium-features
        #{:multi-factor-auth}
         (mt/with-temporary-setting-values
           [mfa-enforcement          :required
            mfa-requirement-deadline nil]
           (mt/with-premium-features
            #{}
             (mt/with-temp
               [:model/User {user-id :id} {}]
               (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id)
                     session       (generate-session-and-get-user-info! user-id (:id auth-identity))]
                 (is (some? session)))))))))
    (mt/when-ee-evailable
     (testing "With feature flag on, password doesn't work"
       (mt/with-premium-features
        #{:multi-factor-auth}
         (mt/with-temporary-setting-values
           [mfa-enforcement :required
            mfa-requirement-deadline nil]
           (mt/with-temp
             [:model/User {user-id :id} {}]
             (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id)
                   session       (generate-session-and-get-user-info! user-id (:id auth-identity))]
               (is (nil? session)))))))
     (testing "With feature flag on before deadline, password doesn't work"
       (mt/with-premium-features
        #{:multi-factor-auth}
         (mt/with-temporary-setting-values
           [mfa-enforcement :required
            mfa-requirement-deadline (t/plus (t/offset-date-time)
                                             (t/hours 16))]
           (mt/with-temp
             [:model/User {user-id :id} {}]
             (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id)
                   session       (generate-session-and-get-user-info! user-id (:id auth-identity))]
               (is (some? session)))))))
     (testing "With feature flag on after deadline, password doesn't work"
       (mt/with-premium-features
        #{:multi-factor-auth}
         (mt/with-temporary-setting-values
           [mfa-enforcement :required
            mfa-requirement-deadline (t/minus (t/offset-date-time)
                                              (t/hours 16))]
           (mt/with-temp
             [:model/User {user-id :id} {}]
             (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id)
                   session       (generate-session-and-get-user-info! user-id (:id auth-identity))]
               (is (nil? session))))))))))

(deftest mfa-providers-test
  (init-status/set-complete!)
  (doseq [provider (->> (descendants :metabase.auth-identity.provider/provider)
                        ;; We test password separately above because of toucan weirdnes
                        (remove #{:provider/password})
                        ;; This one doesn't let you get a session normally
                        (remove #{:provider/emailed-secret-password-reset}))]
    (testing (name provider)
      (testing "With feature flag off, all providers work"
        (mt/with-premium-features
         #{}
          (mt/with-temp
            [:model/User {user-id :id} {}
             :model/AuthIdentity {auth-identity-id :id} {:user_id  user-id
                                                         :provider (name provider)}]
            (let [session (generate-session-and-get-user-info! user-id auth-identity-id)]
              (is (some? session))))))
      (testing "When you lose access to the feature, MFA doesn't apply anymore."
        (mt/when-ee-evailable
         (mt/with-premium-features
          #{:multi-factor-auth}
           (mt/with-temporary-setting-values
             [mfa-enforcement          :required
              mfa-requirement-deadline nil]
             (mt/with-premium-features
              #{}
               (mt/with-temp
                 [:model/User {user-id :id} {}
                  :model/AuthIdentity {auth-identity-id :id} {:user_id  user-id
                                                              :provider (name provider)}]
                 (let [session (generate-session-and-get-user-info! user-id auth-identity-id)]
                   (is (some? session)))))))))
      (mt/when-ee-evailable
       (let [supports-mfa (isa? provider :metabase.auth-identity.provider/supports-mfa)]
         (testing "With mfa is being enforced, methods that support mfa don't work"
           (mt/with-premium-features
            #{:multi-factor-auth}
             (mt/with-temporary-setting-values
               [mfa-enforcement :required
                mfa-requirement-deadline nil]
               (mt/with-temp
                 [:model/User {user-id :id} {}
                  :model/AuthIdentity {auth-identity-id :id} {:user_id  user-id
                                                              :provider (name provider)}]
                 (let [session (generate-session-and-get-user-info! user-id auth-identity-id)]
                   (is ((if supports-mfa nil? some?) session)))))))
         (testing "With mfa is being enforced but the enrollment deadline has not passed, methods that support mfa still work"
           (mt/with-premium-features
            #{:multi-factor-auth}
             (mt/with-temporary-setting-values
               [mfa-enforcement :required
                mfa-requirement-deadline (t/plus (t/offset-date-time)
                                                 (t/hours 16))]
               (mt/with-temp
                 [:model/User {user-id :id} {}
                  :model/AuthIdentity {auth-identity-id :id} {:user_id  user-id
                                                              :provider (name provider)}]
                 (let [session (generate-session-and-get-user-info! user-id auth-identity-id)]
                   (is (some? session)))))))
         (testing "With mfa is being enforced but the enrollment deadline has not passed, methods that support mfa don't work"
           (mt/with-premium-features
            #{:multi-factor-auth}
             (mt/with-temporary-setting-values
               [mfa-enforcement :required
                mfa-requirement-deadline (t/minus (t/offset-date-time)
                                                  (t/hours 16))]
               (mt/with-temp
                 [:model/User {user-id :id} {}
                  :model/AuthIdentity {auth-identity-id :id} {:user_id  user-id
                                                              :provider (name provider)}]
                 (let [session (generate-session-and-get-user-info! user-id auth-identity-id)]
                   (is ((if supports-mfa nil? some?) session))))))))))))

(deftest mfa-providers-list-test
  (testing "Ldap and password are the only ones that support mfa"
    (is (= #{:provider/password :provider/ldap}
           (descendants :metabase.auth-identity.provider/supports-mfa))))
  (testing "and the hard-coded list the session query is compiled from says the same thing"
    (is (= #{:provider/password :provider/ldap}
           @#'server.db/mfa-supported-methods))))

(deftest mfa-session-preservation-test
  (init-status/set-complete!)
  (testing "If you had a session before MFA was required, it is not preserved"
    (mt/when-ee-evailable
     (mt/with-premium-features
      #{}
       (mt/with-temp
         [:model/User {user-id :id} {}]
         (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id)
               session-key (generate-session! user-id (:id auth-identity))]
           (is (session-valid? session-key))
           (mt/with-premium-features
            #{:multi-factor-auth}
             (mt/with-temporary-setting-values
               [mfa-enforcement :required
                mfa-requirement-deadline nil]
               (is (not (session-valid? session-key))))))))))
  (testing "If you had a session before MFA was required, but it was MFA'd, it is still preserved"
    (mt/when-ee-evailable
     (mt/with-premium-features
      #{}
       (mt/with-temp
         [:model/User {user-id :id} {}]
         (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id)
               session-key   (generate-mfa-session! user-id (:id auth-identity))]
           (is (session-valid? session-key))
           (mt/with-premium-features
            #{:multi-factor-auth}
             (mt/with-temporary-setting-values
               [mfa-enforcement :required
                mfa-requirement-deadline nil]
               (is (session-valid? session-key)))))))))
  (testing "If you had a session before the MFA requirement deadline, but it was MFA'd, it is still preserved"
    (mt/when-ee-evailable
     (mt/with-premium-features
      #{}
       (mt/with-temp
         [:model/User {user-id :id} {}]
         (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id)
               session-key   (generate-mfa-session! user-id (:id auth-identity))]
           (is (session-valid? session-key))
           (mt/with-premium-features
            #{:multi-factor-auth}
             (mt/with-temporary-setting-values
               [mfa-enforcement :required
                mfa-requirement-deadline (t/minus (t/offset-date-time)
                                                  (t/hours 16))]
               (is (session-valid? session-key))))))))))
