(ns metabase.models.login-history
  (:require [java-time :as t]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel LoginHistory :login_history)

#_(defn- first-log-in-for-user-with-device? [{user-id :user_id, device-id :device_id}]
  (< (count (db/select [LoginHistory :id]
              :user_id user-id
              :device_id device-id
              {:limit 2}))
     2))

(defn post-select [{session-id :session_id, :as login-history}]
  ;; session ID is sensitive, so it's better if we don't even return it. Replace it with a more generic `active?` key.
  (cond-> login-history
    (:session_id login-history) (assoc :active? (boolean session-id))
    true                        (dissoc :session_id)))

(defn pre-update [login-history]
  (throw (RuntimeException. (tru "You can''t update a LoginHistory after it has been created."))))

#_(defn post-insert [login-history]
  (println "RECORDED NEW =>" (u/pprint-to-str 'yellow login-history))
  (println "FIRST LOGIN FOR USER WITH DEVICE?" (first-log-in-for-user-with-device? login-history))
  login-history
  ;; TODO -- email when logging in to a new device (#14313)
  )

(extend (class LoginHistory)
  models/IModel
  (merge
   models/IModelDefaults
   {:post-select post-select
    :pre-update  pre-update
    #_:post-insert #_post-insert}))

(defn recent-logins
  "Return recent logins (sorted by most-recent -> least-recent) for `user-or-id`"
  [user-or-id]
  (db/select [LoginHistory :timestamp :session_id :device_id :device_description :ip_address]
    :user_id (u/the-id user-or-id)
    :timestamp [:> (t/minus (t/offset-date-time) (t/months 1))]
    {:order-by [[:timestamp :desc]]}))
