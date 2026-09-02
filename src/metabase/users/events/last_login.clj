(ns metabase.users.events.last-login
  (:require
   [metabase.events.core :as events]
   [metabase.users.queries :as users.queries]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/user-login ::event)

(methodical/defmethod events/publish-event! ::event
  [topic {:keys [user-id] :as _event}]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (when user-id
    (try
      ;; just make a simple attempt to set the `:last_login` for the given user to now
      (users.queries/set-user-last-login-now! user-id)
      (catch Throwable e
        ;; TODO -- huh? Terrible log message.
        (log/warnf "Failed to process sync-database event. %s: %s" topic (ex-message e))))))
