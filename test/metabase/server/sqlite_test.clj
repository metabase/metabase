(ns metabase.server.sqlite-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.data-source :as data-source]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.server.db :as server-db]
   [metabase.session.db :as session-db]
   [toucan2.core :as t2])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn [f]
    (let [path (Files/createTempFile "metabase-sqlite-sessions-" ".db" (make-array FileAttribute 0))
          source (data-source/broken-out-details->DataSource :sqlite {:db (str path)})]
      (try
        (with-open [conn (.getConnection source)]
          (liquibase/with-liquibase [lb conn]
            (.update lb "")))
        (mdb/with-application-db (connection/application-db :sqlite source)
          (f))
        (finally
          (doseq [suffix ["" "-wal" "-shm"]]
            (Files/deleteIfExists (.resolveSibling path (str (.getFileName path) suffix)))))))))

(defn- lookup
  ([key] (lookup key nil nil false))
  ([key csrf idle-timeout mfa-required]
   (server-db/session-user-info key csrf 60 false false idle-timeout mfa-required)))

(deftest authenticated-session-lookup-test
  (let [now (OffsetDateTime/now)]
    (t2/query {:insert-into :core_user
               :values [{:id 100 :email "sqlite-session@example.com" :entity_id "sqlite-session-user"
                         :is_active true :date_joined now :is_superuser false :is_data_analyst false}]})
    (t2/query {:insert-into :auth_identity
               :values [{:id 100 :user_id 100 :provider "password" :created_at now :updated_at now}]})
    (t2/query {:insert-into :core_session
               :values (for [[key overrides] [["current" {}]
                                              ["old" {:created_at (.minusHours now 2)}]
                                              ["expired" {:expires_at (.minusMinutes now 1)}]
                                              ["idle" {:last_active_at (.minusMinutes now 5)}]
                                              ["embedded" {:anti_csrf_token "csrf-token"}]]]
                         (merge {:id key :key_hashed key :user_id 100 :created_at now
                                 :auth_identity_id 100 :expires_at nil :last_active_at nil :anti_csrf_token nil}
                                overrides))})
    (is (= {:metabase-user-id 100 :is-superuser? false :is-data-analyst? false :user-locale nil :auth-provider "password"}
           (into {} (lookup "current"))))
    (is (nil? (lookup "missing")))
    (is (nil? (lookup "old")))
    (is (nil? (lookup "expired")))
    (is (nil? (lookup "embedded")))
    (is (nil? (lookup "embedded" "wrong-token" nil false)))
    (is (= 100 (:metabase-user-id (lookup "embedded" "csrf-token" nil false))))
    (is (= 100 (:metabase-user-id (lookup "idle"))))
    (is (nil? (lookup "idle" nil 60 false)))
    (server-db/touch-session! "idle")
    (is (= 100 (:metabase-user-id (lookup "idle" nil 60 false))))
    (testing "Password sessions still require the MFA identity when configured"
      (is (nil? (lookup "current" nil nil true)))
      (t2/query {:update :core_session :set {:mfa_auth_identity_id 100} :where [:= :id "current"]})
      (is (= 100 (:metabase-user-id (lookup "current" nil nil true)))))
    (testing "Session cleanup agrees with authentication about age and expiration"
      (session-db/delete-expired-sessions! 60 nil)
      (is (= #{"current" "idle" "embedded"} (set (map :id (t2/query {:select [:id] :from [:core_session]}))))))
    (testing "Deactivated users cannot authenticate with a previously valid session"
      (t2/query {:update :core_user :set {:is_active false} :where [:= :id 100]})
      (is (nil? (lookup "current"))))))
