(ns metabase.config
  (:require [environ.core :as environ]
            [medley.core :as medley])
  (:import (clojure.lang Keyword)))


(def app-defaults
  "Global application defaults"
  {;; Database Configuration  (general options?  dburl?)
   :mb-db-type "h2"
   ;:mb-db-dbname "postgres"
   ;:mb-db-host "localhost"
   ;:mb-db-port "5432"
   ;:mb-db-user "metabase"
   ;:mb-db-pass "metabase"
   :mb-db-file "metabase.db"
   :mb-db-automigrate "true"
   :mb-db-logging "true"
   ;; Embedded Jetty Webserver
   ;; check here for all available options:
   ;; https://github.com/ring-clojure/ring/blob/master/ring-jetty-adapter/src/ring/adapter/jetty.clj
   :mb-jetty-port "3000"
   ;; Other Application Settings
   :max-session-age "20160"})                    ; session length in minutes (14 days)


(defn config-str
  "Retrieve value for a single configuration key.  Accepts either a keyword or a string.

   We resolve properties from these places:
   1.  environment variables (ex: MB_DB_TYPE -> :mb-db-type)
   2.  jvm opitons (ex: -Dmb.db.type -> :mb-db-type)
   3.  hard coded `app-defaults`"
  [k]
  (let [k (keyword k)]
    (or (k environ/env) (k app-defaults))))


;; These are convenience functions for accessing config values that ensures a specific return type
(defn ^Integer config-int [k] (when-let [val (config-str k)] (Integer/parseInt val)))
(defn ^Boolean config-bool [k] (when-let [val (config-str k)] (Boolean/parseBoolean val)))
(defn ^Keyword config-kw [k] (when-let [val (config-str k)] (keyword val)))


(def config-all
  "Global application configuration as a dictionary.
   Combines hard coded defaults with optional user specified overrides from environment variables."
  (into {} (map (fn [k] [k (config-str k)]) (keys app-defaults))))


(defn config-match
  "Retrieves all configuration values whose key begin with a specified prefix.
   The returned map will strip the prefix from the key names.
   All returned values will be Strings.

   For example if you wanted all of Java's internal environment config values:
   * (config-match \"java-\") -> {:version \"25.25-b02\" :info \"mixed mode\"}"
  [prefix]
  (let [prefix-regex (re-pattern (str ":" prefix ".*"))]
    (->> (merge
          (medley/filter-keys (fn [k] (re-matches prefix-regex (str k))) app-defaults)
          (medley/filter-keys (fn [k] (re-matches prefix-regex (str k))) environ/env))
      (medley/map-keys (fn [k] (let [kstr (str k)] (keyword (subs kstr (+ 1 (count prefix))))))))))
