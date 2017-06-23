(ns metabase.reset-password.core
  (:gen-class)
  (:require [metabase.db :as mdb]
            [metabase.models.user :as user]
            [toucan.db :as db]))

(defn- set-reset-token!
  "Set and return a new `reset_token` for the user with EMAIL-ADDRESS."
  [email-address]
  (let [user-id (or (db/select-one-id 'User, :email email-address)
                    (throw (Exception. (format "No user found with email address '%s'. Please check the spelling and try again." email-address))))]
    (user/set-password-reset-token! user-id)))

(defn -main
  [email-address]
  (mdb/setup-db!)
  (printf "Resetting password for %s...\n" email-address)
  (try
    (printf "OK [[[%s]]]\n" (set-reset-token! email-address))
    (System/exit 0)
    (catch Throwable e
      (printf "FAIL [[[%s]]]\n" (.getMessage e))
      (System/exit -1))))
