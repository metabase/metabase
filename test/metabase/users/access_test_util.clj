(ns metabase.users.access-test-util
  "Helpers for the tests of the paths that deactivate Users: give a User a live session and OAuth access token, and read
  back whether a write ended and revoked them."
  (:require
   [metabase.session.core :as session]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn give-access!
  "Insert a live session and an OAuth access token for the User with `user-id`, returning their ids as `:session-id`
  and `:token`."
  [user-id]
  (let [session-id (session/generate-session-id)
        token      (str (random-uuid))]
    (t2/insert! (t2/table-name :model/Session)
                {:id         session-id
                 :key_hashed (session/hash-session-key (str (random-uuid)))
                 :user_id    user-id
                 :created_at :%now})
    (t2/insert! :model/OAuthAccessToken {:token     token
                                         :user_id   user-id
                                         :client_id "test-client"
                                         :scope     ["openid"]
                                         :expiry    (+ (inst-ms (java.util.Date.)) 3600000)})
    {:session-id session-id :token token}))

(defn access-state
  "Whether the session of `access`, as [[give-access!]] returns it, was ended and why, and whether its token was revoked."
  [{:keys [session-id token]}]
  (let [stored (t2/select-one :model/Session :id session-id)]
    {:session-ended? (some? (:ended_at stored))
     :end-reason     (:end_reason stored)
     :token-revoked? (some? (t2/select-one-fn :revoked_at :model/OAuthAccessToken :token token))}))

(def revoked
  "The [[access-state]] of access that a deactivation took away."
  {:session-ended? true :end-reason "user-deactivated" :token-revoked? true})

(def live
  "The [[access-state]] of access that nothing took away."
  {:session-ended? false :end-reason nil :token-revoked? false})
