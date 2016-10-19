(ns metabase.config
  (:require (clojure.java [io :as io]
                          [shell :as shell])
            [clojure.string :as s]
            [environ.core :as environ])
  (:import clojure.lang.Keyword))

(def ^:private ^:const app-defaults
  "Global application defaults"
  {;; Database Configuration  (general options?  dburl?)
   :mb-run-mode "prod"
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
   :mb-jetty-join "true"
   ;; Other Application Settings
   :mb-password-complexity "normal"
   ;:mb-password-length "8"
   :mb-version-info-url "http://static.metabase.com/version-info.json"
   :max-session-age "20160"                     ; session length in minutes (14 days)
   :mb-colorize-logs "true"})


(defn config-str
  "Retrieve value for a single configuration key.  Accepts either a keyword or a string.

   We resolve properties from these places:

   1.  environment variables (ex: MB_DB_TYPE -> :mb-db-type)
   2.  jvm options (ex: -Dmb.db.type -> :mb-db-type)
   3.  hard coded `app-defaults`"
  [k]
  (let [k (keyword k)]
    (or (k environ/env) (k app-defaults))))


;; These are convenience functions for accessing config values that ensures a specific return type
;; TODO - These names are bad. They should be something like  `int`, `boolean`, and `keyword`, respectively.
;; See https://github.com/metabase/metabase/wiki/Metabase-Clojure-Style-Guide#dont-repeat-namespace-alias-in-function-names for discussion
(defn ^Integer config-int  "Fetch a configuration key and parse it as an integer." [k] (some-> k config-str Integer/parseInt))
(defn ^Boolean config-bool "Fetch a configuration key and parse it as a boolean."  [k] (some-> k config-str Boolean/parseBoolean))
(defn ^Keyword config-kw   "Fetch a configuration key and parse it as a keyword."  [k] (some-> k config-str keyword))

(def ^:const ^Boolean is-dev?  "Are we running in `dev` mode (i.e. in a REPL or via `lein ring server`)?" (= :dev  (config-kw :mb-run-mode)))
(def ^:const ^Boolean is-prod? "Are we running in `prod` mode (i.e. from a JAR)?"                         (= :prod (config-kw :mb-run-mode)))
(def ^:const ^Boolean is-test? "Are we running in `test` mode (i.e. via `lein test`)?"                    (= :test (config-kw :mb-run-mode)))


;;; Version stuff
;; Metabase version is of the format `GIT-TAG (GIT-SHORT-HASH GIT-BRANCH)`

(defn- version-info-from-shell-script []
  (let [[tag hash branch date] (-> (shell/sh "./bin/version") :out s/trim (s/split #" "))]
    {:tag tag, :hash hash, :branch branch, :date date}))

(defn- version-info-from-properties-file []
  (when-let [props-file (io/resource "version.properties")]
    (with-open [reader (io/reader props-file)]
      (let [props (java.util.Properties.)]
        (.load props reader)
        (into {} (for [[k v] props]
                   [(keyword k) v]))))))

(def ^:const mb-version-info
  "Information about the current version of Metabase.
   This comes from `resources/version.properties` for prod builds and is fetched from `git` via the `./bin/version` script for dev.

     mb-version-info -> {:tag: \"v0.11.1\", :hash: \"afdf863\", :branch: \"about_metabase\", :date: \"2015-10-05\"}"
  (if is-prod?
    (version-info-from-properties-file)
    (version-info-from-shell-script)))

(def ^:const mb-version-string
  "A formatted version string representing the currently running application."
  (let [{:keys [tag hash branch]} mb-version-info]
    (format "%s (%s %s)" tag hash branch)))
