(ns metabase.session.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.session.core :as session]
   [metabase.session.db :as session.db]
   [metabase.test :as mt]
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
        (is (= 1 (session.db/end-sessions! {:key_hashed (session/hash-session-key session-key)} "logout" :self)))
        (is (= {:end_reason "logout", :ended_by_user_id user-id, :key_hashed nil} (row by-key))
            "`:self` attributes the ending to the session's own user")
        (is (some? (:ended_at (t2/select-one :model/Session :id by-key)))))
      (testing "and the old cookie is unauthenticated from then on"
        (is (= "Unauthenticated" (mt/client session-key :get 401 "user/current"))))
      (testing "ending by user records the actor, and only touches that user's live sessions"
        (is (= 1 (session.db/end-sessions! {:user_id user-id} "admin" (mt/user->id :crowberto))))
        (is (= {:end_reason "admin", :ended_by_user_id (mt/user->id :crowberto), :key_hashed nil} (row by-user)))
        (is (= {:end_reason "logout", :ended_by_user_id user-id, :key_hashed nil} (row by-key))
            "an already-ended session keeps its first ending")
        (is (= {:end_reason nil, :ended_by_user_id nil} (dissoc (row others) :key_hashed))))
      (testing "the rows are kept"
        (is (= 3 (t2/count :model/Session :id [:in [by-key by-user others]]))))
      (testing "ending an already-ended session is a no-op"
        (is (zero? (session.db/end-sessions! {:id [by-key by-user]} "admin" nil))))
      (testing "an explicitly empty id list ends nothing"
        (is (zero? (session.db/end-sessions! {:id []} "admin" nil)))))))

(deftest end-sessions-by-ids-batches-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (let [ids (vec (repeatedly 5 #(first (insert-session! user-id))))]
      (binding [session.db/*end-batch-size* 2]
        (is (= 5 (session.db/end-sessions-by-ids! ids "admin" nil))
            "every batch is counted, including the short final one"))
      (is (every? #(nil? (:key_hashed %)) (t2/select :model/Session :id [:in ids])))
      (is (zero? (session.db/end-sessions-by-ids! [] "admin" nil))))))
