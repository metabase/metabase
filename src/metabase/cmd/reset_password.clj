(ns metabase.cmd.reset-password
  (:require [metabase.db :as mdb]
            [metabase.models.user :refer [User] :as user]
            [toucan.db :as db]))

(defn- set-reset-token!
  "Set and return a new `reset_token` for the user with EMAIL-ADDRESS."
  [email-address]
  (let [user-id (or (db/select-one-id User, :email email-address)
                    (throw (Exception. (format "No user found with email address '%s'. Please check the spelling and try again." email-address))))]
    (user/set-password-reset-token! user-id)))

(defn reset-password!
  "Reset the password for EMAIL-ADDRESS, and return the reset token in a format that can be understood by the Mac App."
  [email-address]
  (mdb/setup-db!)
  (println (format "Resetting password for %s...\n" email-address))
  (try
    (println (format "OK [[[%s]]]" (set-reset-token! email-address)))
    (System/exit 0)
    (catch Throwable e
      (println (format "FAIL [[[%s]]]" (.getMessage e)))
      (System/exit -1))))
