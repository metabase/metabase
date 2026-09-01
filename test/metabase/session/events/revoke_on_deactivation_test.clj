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

(deftest revoke-on-event-test
  (testing ":event/user-credentials-revoked deletes the user's sessions, leaving other users' untouched"
    (mt/with-temp [:model/User {victim :id}    {}
                   :model/User {bystander :id} {}]
      (let [victim-session    (insert-session! victim)
            bystander-session (insert-session! bystander)]
        (events/publish-event! :event/user-credentials-revoked {:user-id victim})
        (is (not (t2/exists? :model/Session 'id victim-session))
            "victim's session is deleted")
        (is (t2/exists? :model/Session 'id bystander-session)
            "an unrelated user's session is untouched")))))

(deftest deactivation-revokes-and-reactivation-does-not-revive-test
  (testing "deactivating a user deletes their sessions; reactivating does NOT bring them back (SEC-863)"
    (mt/with-temp [:model/User {user-id :id} {:is_active true}]
      (let [session-id (insert-session! user-id)]
        (is (t2/exists? :model/Session 'id session-id)
            "session exists while the user is active")
        (t2/update! :model/User user-id {:is_active false})
        (is (not (t2/exists? :model/Session 'id session-id))
            "deactivation revokes the session")
        (t2/update! :model/User user-id {:is_active true})
        (is (not (t2/exists? :model/Session 'id session-id))
            "reactivation does not revive the pre-deactivation session")))))
