(ns metabase.reset-password.core
  (:gen-class)
  (:require [metabase.db :as db]
            [metabase.models.user :as user]))

(defn- set-reset-token!
  "Set and return a new `reset_token` for the user with EMAIL-ADDRESS."
  [email-address]
  (let [user-id (or (db/select-one-id 'User, :email email-address)
                    (throw (Exception. (format "No user found with email address '%s'. Please check the spelling and try again." email-address))))]
    (user/set-user-password-reset-token! user-id)))

(defn -main
  [email-address]
  (db/setup-db!)
  (println (format "Resetting password for %s..." email-address))
  (try
    (println (format "OK [[[%s]]]" (set-reset-token! email-address)))
    (System/exit 0)
    (catch Throwable e
      (println (format "FAIL [[[%s]]]" (.getMessage e)))
      (System/exit -1))))
