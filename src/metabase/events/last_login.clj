(ns metabase.events.last-login
  (:require
   [metabase.events :as events]
   [metabase.models.user :refer [User]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)
(derive :event/user-login ::event)

(methodical/defmethod events/publish-event! ::event
  [topic {:keys [user-id] :as _event}]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (when user-id
    (try
      ;; just make a simple attempt to set the `:last_login` for the given user to now
      (t2/update! User user-id {:last_login :%now})
      (catch Throwable e
        (log/warnf e "Failed to process sync-database event. %s" topic)))))
