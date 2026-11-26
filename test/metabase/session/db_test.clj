(ns metabase.session.db-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.session.core :as session]
   [metabase.session.db :as session.db]
   [metabase.session.models.session :as models.session]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- insert-session!
  "Insert a session row the way a login would, returning `[session-id session-key]`."
  [user-id]
  (let [session-key (session/generate-session-key)
        id          (session/generate-session-id)]
    (t2/insert! (t2/table-name :model/Session)
                {:id         id
                 :key_hashed (session/hash-session-key session-key)
                 :user_id    user-id
                 :created_at :%now})
    [id session-key]))

(defn- row [session-id]
  (select-keys (t2/select-one :model/Session :id session-id) [:end_reason :ended_by_user_id :key_hashed]))

(deftest end-sessions-test
  (mt/with-temp [:model/User {user-id :id} {}
                 :model/User {other-id :id} {}]
    (let [[by-key session-key] (insert-session! user-id)
          [by-user _]          (insert-session! user-id)
          [others _]           (insert-session! other-id)]
      (testing "a request presenting the session works before it is ended"
        (is (= user-id (:id (mt/client session-key :get 200 "user/current")))))
      (testing "ending by hashed key records the reason and destroys the key"
        (is (= 1 (models.session/end-session-for-key! (session/hash-session-key session-key) "logout" :self)))
        (is (= {:end_reason "logout", :ended_by_user_id user-id, :key_hashed nil} (row by-key))
            "`:self` attributes the ending to the session's own user")
        (is (some? (:ended_at (t2/select-one :model/Session :id by-key)))))
      (testing "and the old cookie is unauthenticated from then on"
        (is (= "Unauthenticated" (mt/client session-key :get 401 "user/current"))))
      (testing "ending by user records the actor, and only touches that user's live sessions"
        (is (= 1 (models.session/end-sessions-for-users! [user-id] "admin" (mt/user->id :crowberto))))
        (is (= {:end_reason "admin", :ended_by_user_id (mt/user->id :crowberto), :key_hashed nil} (row by-user)))
        (is (= {:end_reason "logout", :ended_by_user_id user-id, :key_hashed nil} (row by-key))
            "an already-ended session keeps its first ending")
        (is (= {:end_reason nil, :ended_by_user_id nil} (dissoc (row others) :key_hashed))))
      (testing "the rows are kept"
        (is (= 3 (t2/count :model/Session :id [:in [by-key by-user others]]))))
      (testing "ending an already-ended session is a no-op"
        (is (zero? (models.session/end-sessions! [by-key by-user] "admin" nil))))
      (testing "an empty id list or user list ends nothing"
        (is (zero? (models.session/end-sessions! [] "admin" nil)))
        (is (zero? (models.session/end-sessions-for-users! [] "admin" nil)))
        (is (= {:end_reason nil, :ended_by_user_id nil} (dissoc (row others) :key_hashed)))))))

(deftest end-sessions-batches-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (let [ids (vec (repeatedly 5 #(first (insert-session! user-id))))]
      ;; a real revoke batches at `default-end-batch-size`; two and a half batches of two exercises the same code,
      ;; including the short final batch, without inserting thousands of rows
      (is (= 5 (models.session/end-sessions! ids "admin" nil 2))
          "every batch is counted, including the short final one")
      (is (every? #(nil? (:key_hashed %)) (t2/select :model/Session :id [:in ids])))
      (is (zero? (models.session/end-sessions! [] "admin" nil))))))

(deftest insert-session-binds-written-values-test
  (testing "GHY-4590: with schema enforcement off, as in prod, an operator form passed as a SAML value or an
            expiry must not become SQL. Unbound, `[:upper \"abc\"]` compiled to `UPPER(?)` and stored `ABC`."
    (mt/with-temp [:model/User {user-id :id} {}]
      (mu/disable-enforcement
        (doseq [[label expires-at opts] [["saml-name-id" nil {:saml_name_id [:upper "abc"]}]
                                         ["saml-session-index" nil {:saml_session_index [:upper "abc"]}]
                                         ["saml-name-id-format" nil {:saml_name_id_format [:upper "abc"]}]
                                         ["expires-at" [:now] {}]]]
          (testing label
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"SAML values must be strings|expires_at must be a temporal value"
                                  (session.db/insert-session! (merge {:id          (session/generate-session-id)
                                                                      :user_id     user-id
                                                                      :session_key (session/generate-session-key)
                                                                      :expires_at  expires-at}
                                                                     opts)))))))
      (is (not (t2/exists? :model/Session :user_id user-id))))))

(deftest insert-session-stores-values-test
  (mt/with-temp [:model/User         {user-id :id} {}
                 :model/AuthIdentity {ai-id :id}   {:user_id user-id :provider "google"}]
    (let [session-key (session/generate-session-key)
          expires-at  (t/offset-date-time 2030 1 1 0 0 0 0 (t/zone-offset 0))
          inserted    (session.db/insert-session! {:id                 (session/generate-session-id)
                                                   :user_id            user-id
                                                   :auth_identity_id   ai-id
                                                   :session_key        session-key
                                                   :expires_at         expires-at
                                                   :saml_session_index "idx-1"
                                                   :saml_name_id       "alice@example.com"})
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

(deftest end-sessions-partitions-test
  (mt/with-temp [:model/User {user-a :id} {}
                 :model/User {user-b :id} {}
                 :model/User {user-c :id} {}]
    (let [ids (vec (for [user-id [user-a user-b user-c user-a user-b]] (first (insert-session! user-id))))]
      (mt/with-partition-size 2
        (testing "every live session of the users is ended, whatever the number of statements"
          (is (= 4 (session.db/end-sessions-for-users! [user-a user-b] "admin" nil)))
          (is (= 1 (session.db/end-sessions! ids "admin" nil)))
          (is (every? #(nil? (:key_hashed %)) (t2/select :model/Session :id [:in ids]))))))))
