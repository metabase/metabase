(ns metabase.session.task.session-cleanup-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.session.core :as session]
   [metabase.session.task.session-cleanup :as session-cleanup]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (metabase.session.task.session_cleanup SessionCleanup)
   (org.quartz Job)))

(set! *warn-on-reflection* true)

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

(deftest clean-expired-sessions-test
  (mt/with-temp-env-var-value! [:max-session-age (str (* 60 24))] ;; one day
    (let [recently (t/minus (t/local-date-time) (t/hours 1))]
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/Session expired-session {:id         "c"
                                                     :key_hashed "c1"
                                                     :user_id    user-id
                                                     :created_at recently
                                                     :expires_at (t/minus (t/instant) (t/minutes 1))}
                     :model/Session unexpired-session {:id         "d"
                                                       :key_hashed "d1"
                                                       :user_id    user-id
                                                       :created_at recently
                                                       :expires_at (t/plus (t/instant) (t/hours 1))}
                     :model/Session no-expiry-session {:id         "e"
                                                       :key_hashed "e1"
                                                       :user_id    user-id
                                                       :created_at recently}]
        (testing "session-cleanup reaps sessions past their expires_at, even when they are within max-session-age"
          (#'session-cleanup/cleanup-sessions!)
          (is (not (t2/exists? :model/Session :id (:id expired-session))))
          (is (t2/exists? :model/Session :id (:id unexpired-session)))
          (is (t2/exists? :model/Session :id (:id no-expiry-session))))))))

(deftest session-cleanup-job-prunes-activity-cache-test
  (testing "the cleanup job prunes the in-memory session activity throttle cache"
    (session/clear-session-activity-cache!)
    (let [key-hash (str (random-uuid))]
      (session/record-session-activity-update! key-hash)
      ;; the cache only drops entries older than the throttle window, so make every entry look stale
      (with-redefs [u/since-ms (constantly Long/MAX_VALUE)]
        (.execute ^Job (SessionCleanup.) nil))
      (is (true? (session/record-session-activity-update! key-hash))
          "a pruned session is no longer throttled"))))

;; cleanup-idle-sessions-test is in metabase-enterprise.api.session-test because it requires EE features.
