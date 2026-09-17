(ns metabase.session.task.session-cleanup-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.session.core :as session]
   [metabase.session.db :as session.db]
   [metabase.session.task.session-cleanup :as session-cleanup]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (metabase.session.task.session_cleanup SessionCleanup)
   (org.quartz Job)))

(set! *warn-on-reflection* true)

(defn- insert-session!
  "Insert a `core_session` row directly, bypassing the model hooks so the timestamps can be arbitrary. Returns the
  session id."
  [user-id & {:as extra-cols}]
  (let [id (session/generate-session-id)]
    (t2/insert! (t2/table-name :model/Session)
                (merge {:id         id
                        :key_hashed (session/hash-session-key (str (random-uuid)))
                        :user_id    user-id
                        :created_at :%now}
                       extra-cols))
    id))

(defn- ending
  "How the session with `session-id` ended, or nil if it has not: its reason, whether its key is cleared, and whether
  `ended_at` is set. Nil if the row is gone."
  [session-id]
  (when-let [{:keys [ended_at end_reason key_hashed]} (t2/select-one :model/Session :id session-id)]
    {:reason end_reason, :ended? (some? ended_at), :key-cleared? (nil? key_hashed)}))

(defn- sweep! [] (#'session-cleanup/cleanup-sessions!))

(deftest sweep-records-max-age-expiry-test
  (mt/with-temp-env-var-value! [:max-session-age (str (* 60 24))] ;; one day
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [old (insert-session! user-id :created_at (t/minus (t/local-date-time) (t/days 2)))
            new (insert-session! user-id :created_at (t/minus (t/local-date-time) (t/hours 5)))]
        (testing "a session past max-session-age is recorded as expired, its key cleared, and the row kept"
          (sweep!)
          (is (= {:reason "expired", :ended? true, :key-cleared? true} (ending old)))
          (is (= {:reason nil, :ended? false, :key-cleared? false} (ending new))))))))

(deftest sweep-records-hard-expiry-test
  (mt/with-temp-env-var-value! [:max-session-age (str (* 60 24))] ;; one day
    (let [recently (t/minus (t/local-date-time) (t/hours 1))]
      (mt/with-temp [:model/User {user-id :id} {}]
        (let [expired   (insert-session! user-id :created_at recently :expires_at (t/minus (t/instant) (t/minutes 1)))
              unexpired (insert-session! user-id :created_at recently :expires_at (t/plus (t/instant) (t/hours 1)))
              no-expiry (insert-session! user-id :created_at recently)]
          (testing "a session past its own expires_at is recorded as expired even inside max-session-age"
            (sweep!)
            (is (= {:reason "expired", :ended? true, :key-cleared? true} (ending expired)))
            (is (false? (:ended? (ending unexpired))))
            (is (false? (:ended? (ending no-expiry))))))))))

(deftest sweep-records-user-deactivation-test
  (mt/with-temp [:model/User {user-id :id} {:is_active true}]
    (let [session-id (insert-session! user-id)
          ;; also past max age, to show which reason wins
          old-session (insert-session! user-id :created_at (t/minus (t/local-date-time) (t/days 400)))]
      ;; the raw table: the model's before-update would end the sessions itself, which is not what this test is about
      (t2/update! (t2/table-name :model/User) user-id {:is_active false})
      (sweep!)
      (testing "a deactivated user's session is recorded as user-deactivated"
        (is (= {:reason "user-deactivated", :ended? true, :key-cleared? true} (ending session-id))))
      (testing "deactivation wins over expiry when both apply"
        (is (= "user-deactivated" (:reason (ending old-session))))))))

(deftest sweep-leaves-recorded-endings-alone-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (let [session-id (insert-session! user-id :created_at (t/minus (t/local-date-time) (t/days 400)))]
      (session.db/end-sessions! {:id [session-id]} "logout" :self)
      (let [before (t2/select-one :model/Session :id session-id)]
        (sweep!)
        (testing "a session whose ending is already recorded keeps its reason and instant, however stale it is now"
          (is (= (select-keys before [:end_reason :ended_at :ended_by_user_id])
                 (select-keys (t2/select-one :model/Session :id session-id)
                              [:end_reason :ended_at :ended_by_user_id]))))))))

(deftest sweep-deletes-sessions-ended-long-ago-test
  (mt/with-temp-env-var-value! [:max-session-age (str (* 60 24 60))] ;; sixty days
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [ended-at (fn [days-ago] (t/minus (t/offset-date-time) (t/days days-ago)))
            gone     (insert-session! user-id :key_hashed nil :end_reason "logout" :ended_at (ended-at 31))
            kept     (insert-session! user-id :key_hashed nil :end_reason "logout" :ended_at (ended-at 29))
            live     (insert-session! user-id :created_at (t/minus (t/local-date-time) (t/days 45)))]
        (sweep!)
        (testing "a session ended more than thirty days ago is deleted"
          (is (nil? (ending gone))))
        (testing "one ended less than thirty days ago is kept"
          (is (= {:reason "logout", :ended? true, :key-cleared? true} (ending kept))))
        (testing "a live session is never deleted, whatever its age below max-session-age"
          (is (= {:reason nil, :ended? false, :key-cleared? false} (ending live))))))))

(deftest sweep-deletes-expired-mcp-rows-test
  (mt/with-temp-env-var-value! [:max-session-age (str (* 60 24))] ;; one day
    (mt/with-temp [:model/User         {user-id :id} {}
                   :model/AuthIdentity {mcp-id :id}  {:user_id user-id :provider "mcp"}]
      (let [expired-mcp (insert-session! user-id :auth_identity_id mcp-id
                                         :created_at (t/minus (t/local-date-time) (t/days 2)))
            fresh-mcp   (insert-session! user-id :auth_identity_id mcp-id)]
        (sweep!)
        (testing "an expired MCP-backed row is deleted outright, never recorded as ended"
          (is (nil? (ending expired-mcp))))
        (testing "a fresh MCP-backed row is left alone"
          (is (= {:reason nil, :ended? false, :key-cleared? false} (ending fresh-mcp))))))))

(deftest session-cleanup-job-prunes-activity-cache-test
  (testing "the cleanup job prunes the in-memory session activity throttle cache"
    (session/clear-session-activity-cache!)
    (let [key-hash (str (random-uuid))]
      (session/record-session-activity-update! key-hash)
      ;; the cache only drops entries older than the throttle window, so make every entry look stale
      (mt/with-dynamic-fn-redefs [u/since-ms (constantly Long/MAX_VALUE)]
        (.execute ^Job (SessionCleanup.) nil))
      (is (true? (session/record-session-activity-update! key-hash))
          "a pruned session is no longer throttled"))))

;; the idle-timeout pass is tested in metabase-enterprise.api.session-test because it requires EE features.
