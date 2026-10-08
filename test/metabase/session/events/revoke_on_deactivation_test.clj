(ns metabase.session.events.revoke-on-deactivation-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.events.core :as events]
   [metabase.session.core :as session]
   [metabase.session.events.revoke-on-deactivation] ; for side effects: registers the event subscriber
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- insert-session!
  "Insert a session row for `user-id` (bypassing model hooks, as the other session tests do) and return its id."
  [user-id]
  (let [id (session/generate-session-id)]
    (t2/insert! (t2/table-name :model/Session)
                {:id         id
                 :key_hashed (session/hash-session-key (str (random-uuid)))
                 :user_id    user-id
                 :created_at :%now})
    id))

(defn- ending [session-id]
  (select-keys (t2/select-one :model/Session :id session-id) [:end_reason :ended_by_user_id :key_hashed]))

(deftest revoke-on-event-test
  (testing ":event/user-credentials-revoked ends the user's sessions, leaving other users' untouched"
    (mt/with-temp [:model/User {victim :id}    {}
                   :model/User {bystander :id} {}]
      (let [victim-session    (insert-session! victim)
            bystander-session (insert-session! bystander)]
        (mt/with-current-user (mt/user->id :crowberto)
          (events/publish-event! :event/user-credentials-revoked {:user-id victim}))
        (is (= {:end_reason "user-deactivated", :ended_by_user_id (mt/user->id :crowberto), :key_hashed nil}
               (ending victim-session))
            "victim's session is ended, attributed to the deactivating admin, and its key destroyed")
        (is (some? (:ended_at (t2/select-one :model/Session :id victim-session))))
        (is (= {:end_reason nil, :ended_by_user_id nil} (dissoc (ending bystander-session) :key_hashed))
            "an unrelated user's session is untouched")))))

(deftest deactivation-revokes-and-reactivation-does-not-revive-test
  (testing "deactivating a user ends their sessions; reactivating does NOT bring them back (SEC-863)"
    (mt/with-temp [:model/User {user-id :id} {:is_active true}]
      (let [session-id (insert-session! user-id)]
        (is (nil? (:ended_at (t2/select-one :model/Session :id session-id)))
            "session is live while the user is active")
        (t2/update! :model/User user-id {:is_active false})
        (is (= {:end_reason "user-deactivated", :ended_by_user_id nil, :key_hashed nil} (ending session-id))
            "deactivation outside a request ends the session with no actor")
        (t2/update! :model/User user-id {:is_active true})
        (is (= {:end_reason "user-deactivated", :ended_by_user_id nil, :key_hashed nil} (ending session-id))
            "reactivation does not revive the pre-deactivation session")))))
