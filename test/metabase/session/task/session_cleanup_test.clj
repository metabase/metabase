(ns metabase.session.task.session-cleanup-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.session.task.session-cleanup :as session-cleanup]
   [metabase.test :as mt]
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
