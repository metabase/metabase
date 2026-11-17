(ns metabase.auth-identity.db-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.auth-identity.db :as auth-identity.db]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(deftest operator-shaped-provider-is-not-structure-test
  (testing "GHY-4590: with schema enforcement off, as in prod, an operator form passed as `provider` must not
            become SQL structure. Unbound, `[:like \"%\"]` compiled to `provider LIKE '%'` and matched every
            provider."
    (mt/with-temp [:model/User         {user-id :id} {}
                   :model/AuthIdentity _             {:user_id user-id :provider "google"}]
      (mu/disable-enforcement
        (doseq [[fn-name f] {"auth-identity"          auth-identity.db/auth-identity
                             "auth-identity-id"       auth-identity.db/auth-identity-id
                             "auth-identity-expiry"   auth-identity.db/auth-identity-expiry
                             "auth-identity-exists?"  auth-identity.db/auth-identity-exists?
                             "delete-auth-identities!" auth-identity.db/delete-auth-identities!}]
          (testing fn-name
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Marked a whole operator form"
                                  (f user-id [:like "%"])))))
        (is (t2/exists? :model/AuthIdentity :user_id user-id :provider "google"))))))

(deftest insert-session-binds-written-values-test
  (testing "GHY-4590: with schema enforcement off, as in prod, an operator form passed as a SAML value or an
            expiry must not become SQL. Unbound, `[:upper \"abc\"]` compiled to `UPPER(?)` and stored `ABC`."
    (mt/with-temp [:model/User {user-id :id} {}]
      (mu/disable-enforcement
        (doseq [[label expires-at opts] [["saml-name-id" nil {:saml-name-id [:upper "abc"]}]
                                         ["saml-session-index" nil {:saml-session-index [:upper "abc"]}]
                                         ["saml-name-id-format" nil {:saml-name-id-format [:upper "abc"]}]
                                         ["expires-at" [:now] {}]]]
          (testing label
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Marked a whole operator form"
                                  (auth-identity.db/insert-session! (session/generate-session-id) user-id nil
                                                                    (session/generate-session-key) expires-at nil
                                                                    opts))))))
      (is (not (t2/exists? :model/Session :user_id user-id))))))

(deftest insert-session-stores-values-test
  (mt/with-temp [:model/User         {user-id :id} {}
                 :model/AuthIdentity {ai-id :id}   {:user_id user-id :provider "google"}]
    (let [session-key (session/generate-session-key)
          expires-at  (t/offset-date-time 2030 1 1 0 0 0 0 (t/zone-offset 0))
          inserted    (auth-identity.db/insert-session! (session/generate-session-id) user-id ai-id session-key
                                                        expires-at nil
                                                        {:saml-session-index "idx-1"
                                                         :saml-name-id       "alice@example.com"})
          row         (t2/select-one :model/Session :id (:id inserted))]
      (testing "the key is stored hashed, and every other value is stored as given"
        (is (= (session/hash-session-key session-key) (:key_hashed row)))
        (is (=? {:user_id             user-id
                 :auth_identity_id    ai-id
                 :mfa_auth_identity_id nil
                 :expires_at          #(t/= expires-at (t/offset-date-time %))
                 :saml_session_index  "idx-1"
                 :saml_name_id        "alice@example.com"
                 :saml_name_id_format nil}
                row))))))

(deftest lookups-filter-by-user-and-provider-test
  (mt/with-temp [:model/User         {user-id :id}  {}
                 :model/User         {other-id :id} {}
                 :model/AuthIdentity {ai-id :id}    {:user_id user-id :provider "google"}
                 :model/AuthIdentity _              {:user_id other-id :provider "google"}]
    (testing "a matching user and provider finds the identity"
      (is (= ai-id (:id (auth-identity.db/auth-identity user-id "google"))))
      (is (= ai-id (auth-identity.db/auth-identity-id user-id "google")))
      (is (= ai-id (:id (auth-identity.db/auth-identity-expiry user-id "google"))))
      (is (true? (auth-identity.db/auth-identity-exists? user-id "google"))))
    (testing "another provider matches nothing"
      (is (nil? (auth-identity.db/auth-identity user-id "password")))
      (is (nil? (auth-identity.db/auth-identity-id user-id "password")))
      (is (nil? (auth-identity.db/auth-identity-expiry user-id "password")))
      (is (false? (auth-identity.db/auth-identity-exists? user-id "password"))))
    (testing "a SQL-shaped provider is compared as a string, matching nothing"
      (is (false? (auth-identity.db/auth-identity-exists? user-id "google' OR '1'='1"))))
    (testing "delete removes only the given user's identity at the given provider"
      (is (= 0 (auth-identity.db/delete-auth-identities! user-id "password")))
      (is (= 1 (auth-identity.db/delete-auth-identities! user-id "google")))
      (is (t2/exists? :model/AuthIdentity :user_id other-id :provider "google")))
    (testing "an id-only lookup still finds the user"
      (is (true? (auth-identity.db/user-active? user-id))))))
