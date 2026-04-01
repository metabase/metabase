(ns metabase.session.task.session-cleanup-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.session.core :as session]
   [metabase.session.task.session-cleanup :as session-cleanup]
   [metabase.test :as mt]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(deftest clean-sessions-test
  (mt/with-temp-env-var-value! [:max-session-age (str (* 60 24))] ;; one day

    (mt/with-temp [:model/User {user-id :id} {}
                   :model/Session old-session {:id         "a"
                                               :key_hashed "a1"
                                               :user_id    user-id
                                               :created_at (t/minus (t/local-date-time) (t/days 2))}
                   :model/Session new-session {:id         "b"
                                               :key_hashed "b1"
                                               :user_id    user-id
                                               :created_at (t/minus (t/local-date-time) (t/hours 5))}]
      (testing "session-cleanup deletes old sessions and keeps new enough ones"
        (is (t2/select-one :model/Session :id (old-session :id)))
        (#'session-cleanup/cleanup-sessions!)
        (is (not (t2/exists? :model/Session :id (:id old-session))))
        (is (t2/exists? :model/Session :id (:id new-session)))))))

(deftest cleanup-idle-sessions-test
  (testing "With session-timeout configured, idle sessions are also cleaned up"
    (mt/with-premium-features #{:session-timeout-config}
      (mt/with-temporary-setting-values [session-timeout {:amount 5 :unit "minutes"}]
        (mt/with-temp [:model/User {user-id :id}]
          (let [active-id   (session/generate-session-id)
                active-key  (session/hash-session-key (str (random-uuid)))
                idle-id     (session/generate-session-id)
                idle-key    (session/hash-session-key (str (random-uuid)))
                no-activity-id (session/generate-session-id)
                no-activity-key (session/hash-session-key (str (random-uuid)))]
            ;; Active session: last_active_at = now
            (t2/insert! (t2/table-name :model/Session)
                        {:id active-id :key_hashed active-key :user_id user-id
                         :created_at :%now :last_active_at :%now})
            ;; Idle session: last_active_at = 10 minutes ago
            (t2/insert! (t2/table-name :model/Session)
                        {:id idle-id :key_hashed idle-key :user_id user-id
                         :created_at :%now
                         :last_active_at (h2x/add-interval-honeysql-form (mdb/db-type) :%now -600 :second)})
            ;; Session with no activity tracking (NULL last_active_at), created recently
            (t2/insert! (t2/table-name :model/Session)
                        {:id no-activity-id :key_hashed no-activity-key :user_id user-id
                         :created_at :%now})
            (#'session-cleanup/cleanup-sessions!)
            (testing "active session is kept"
              (is (t2/exists? :model/Session :id active-id)))
            (testing "idle session is deleted"
              (is (not (t2/exists? :model/Session :id idle-id))))
            (testing "session with NULL last_active_at but recent created_at is kept"
              (is (t2/exists? :model/Session :id no-activity-id)))))))))
