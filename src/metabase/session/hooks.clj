(ns metabase.session.hooks
  "Hooks that end the sessions of a User who is deactivated, so a later reactivation cannot revive a session cookie
  from before. (SEC-863)"
  (:require
   [metabase.api.common :as api]
   [metabase.session.db :as session.db]))

(defn after-user-deactivated
  "Hook for the User `user-id` as it is deactivated, which ends their sessions, attributed to the deactivating admin
  when the deactivation came in over the API and to nobody otherwise."
  [user-id]
  (session.db/end-sessions! {:user_id user-id} "user-deactivated" api/*current-user-id*))
