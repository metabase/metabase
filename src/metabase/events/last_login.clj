(ns metabase.events.last-login
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase.events :as events]
            [metabase.models.user :refer [User]]
            [toucan.db :as db]))

(def ^:const last-login-topics
  "The `Set` of event topics which are subscribed to for use in last login tracking."
  #{:user-login})

(defonce ^:private ^{:doc "Channel for receiving event notifications we want to subscribe to for last login events."}
  last-login-channel
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(defn process-last-login-event
  "Handle processing for a single event notification received on the last-login-channel"
  [last-login-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{object :item} last-login-event]
      ;; just make a simple attempt to set the `:last_login` for the given user to now
      (when-let [user-id (:user_id object)]
        (db/update! User user-id, :last_login :%now)))
    (catch Throwable e
      (log/warn (format "Failed to process sync-database event. %s" (:topic last-login-event)) e))))



;;; ## ---------------------------------------- LIFECYLE ----------------------------------------

(defmethod events/init! ::LastLogin
  [_]
  (events/start-event-listener! last-login-topics last-login-channel process-last-login-event))
