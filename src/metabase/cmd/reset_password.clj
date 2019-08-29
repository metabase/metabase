(ns metabase.cmd.reset-password
  (:require [metabase.db :as mdb]
            [metabase.models.user :as user :refer [User]]
            [metabase.util.i18n :refer [deferred-trs trs]]
            [toucan.db :as db]))

(defn- set-reset-token!
  "Set and return a new `reset_token` for the user with EMAIL-ADDRESS."
  [email-address]
  (let [user-id (or (db/select-one-id User, :email email-address)
                    (throw (Exception. (str (deferred-trs "No user found with email address ''{0}''. " email-address)
                                            (deferred-trs "Please check the spelling and try again.")))))]
    (user/set-password-reset-token! user-id)))

(defn reset-password!
  "Reset the password for EMAIL-ADDRESS, and return the reset token in a format that can be understood by the Mac App."
  [email-address]
  (mdb/setup-db!)
  (println (str (deferred-trs "Resetting password for {0}..." email-address)
                "\n"))
  (try
    (println (trs "OK [[[{0}]]]" (set-reset-token! email-address)))
    (System/exit 0)
    (catch Throwable e
      (println (trs "FAIL [[[{0}]]]" (.getMessage e)))
      (System/exit -1))))
