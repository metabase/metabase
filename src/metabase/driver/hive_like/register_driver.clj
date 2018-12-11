(ns metabase.driver.hive-like.register-driver
  (:require [clojure.tools.logging :as log]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]])
  (:import clojure.lang.Reflector
           java.sql.DriverManager))

(defn- register-hive-jdbc-driver! [& {:keys [remaining-tries], :or {remaining-tries 5}}]
  ;; manually register our FixedHiveDriver with java.sql.DriverManager
  (DriverManager/registerDriver
   (Reflector/invokeConstructor
    (Class/forName "metabase.driver.FixedHiveDriver")
    (into-array [])))
  ;; now make sure it's the only driver returned
  ;; for jdbc:hive2, since we do not want to use the driver registered by the super class of our FixedHiveDriver.
  (when-let [driver (u/ignore-exceptions
                      (DriverManager/getDriver "jdbc:hive2://localhost:10000"))]
    (let [registered? (instance? (Class/forName "metabase.driver.FixedHiveDriver") driver)]
      (cond
        registered?
        true

        ;; if it's not the registered driver, deregister the current driver (if applicable) and try a couple more times
        ;; before giving up :(
        (and (not registered?)
             (> remaining-tries 0))
        (do
          (when driver
            (DriverManager/deregisterDriver driver))
          (recur {:remaining-tries (dec remaining-tries)}))

        :else
        (log/error
         (trs "Error: metabase.driver.FixedHiveDriver is registered, but JDBC does not seem to be using it."))))))

(def ^:private registered? (atom false))

(defn register-hive-jdbc-driver-if-needed!
  "Try to register the Hive JDBC driver. returns true if successful."
  []
  (when-not @registered?
    (when (u/ignore-exceptions (Class/forName "metabase.driver.FixedHiveDriver"))
      (when (u/ignore-exceptions (register-hive-jdbc-driver!))
        (log/info (trs "Successfully registered metabase.driver.FixedHiveDriver with JDBC."))
        (reset! registered? true)))))

(defn available?
  "Default implementation of `driver/available?` for `:hive-like` drivers."
  []
  (register-hive-jdbc-driver-if-needed!)
  @registered?)
