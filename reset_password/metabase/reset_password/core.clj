(ns metabase.reset-password.core
  (:gen-class)
  (:require [clojure.java.jdbc :as jdbc]))

(defn- db-filepath->connection-details [filepath]
  {:classname   "org.h2.Driver"
   :subprotocol "h2"
   :subname     (str "file:" filepath ";MV_STORE=FALSE;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1")})

(defn- set-reset-token! [dbpath email-address reset-token]
  (let [rows-affected (jdbc/execute! (db-filepath->connection-details dbpath) ["UPDATE CORE_USER SET RESET_TOKEN = ?, RESET_TRIGGERED = ? WHERE EMAIL = ?;" reset-token (System/currentTimeMillis) email-address])]
    (when (not= rows-affected [1])
      (throw (Exception. (format "No user found with email address '%s'. Please check the spelling and try again." email-address))))))

(defn -main
  [dbpath email-address]
  (try
    (let [reset-token (str (java.util.UUID/randomUUID))]
      (set-reset-token! dbpath email-address reset-token)
      (println (format "OK [[[%s]]]" reset-token)))
    (catch Throwable e
      (println (format "FAIL [[[%s]]]" (.getMessage e)))
      (System/exit -1))))
