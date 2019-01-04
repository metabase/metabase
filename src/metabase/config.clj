(ns metabase.config
  (:require [clojure.java
             [io :as io]
             [shell :as shell]]
            [clojure.string :as s]
            [environ.core :as environ])
  (:import clojure.lang.Keyword))

(def ^Boolean is-windows?
  "Are we running on a Windows machine?"
  (s/includes? (s/lower-case (System/getProperty "os.name")) "win"))

(def ^:private app-defaults
  "Global application defaults"
  {:mb-run-mode            "prod"
   ;; DB Settings
   :mb-db-type             "h2"
   :mb-db-file             "metabase.db"
   :mb-db-automigrate      "true"
   :mb-db-logging          "true"
   ;; Jetty Settings. Full list of options is available here: https://github.com/ring-clojure/ring/blob/master/ring-jetty-adapter/src/ring/adapter/jetty.clj
   :mb-jetty-port          "3000"
   :mb-jetty-join          "true"
   ;; other application settings
   :mb-password-complexity "normal"
   :mb-version-info-url    "http://static.metabase.com/version-info.json"
   :max-session-age        "20160"                                        ; session length in minutes (14 days)
   :mb-colorize-logs       (str (not is-windows?))                        ; since PowerShell and cmd.exe don't support ANSI color escape codes or emoji,
   :mb-emoji-in-logs       (str (not is-windows?))                        ; disable them by default when running on Windows. Otherwise they're enabled
   :mb-qp-cache-backend    "db"})


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

(def ^Boolean is-dev?  "Are we running in `dev` mode (i.e. in a REPL or via `lein ring server`)?" (= :dev  (config-kw :mb-run-mode)))
(def ^Boolean is-prod? "Are we running in `prod` mode (i.e. from a JAR)?"                         (= :prod (config-kw :mb-run-mode)))
(def ^Boolean is-test? "Are we running in `test` mode (i.e. via `lein test`)?"                    (= :test (config-kw :mb-run-mode)))


;;; Version stuff
;; Metabase version is of the format `GIT-TAG (GIT-SHORT-HASH GIT-BRANCH)`

(defn- version-info-from-shell-script []
  (try
    (let [[tag hash branch date] (-> (shell/sh "./bin/version") :out s/trim (s/split #" "))]
      {:tag    (or tag "?")
       :hash   (or hash "?")
       :branch (or branch "?")
       :date   (or date "?")})
    ;; if ./bin/version fails (e.g., if we are developing on Windows) just return something so the whole thing doesn't barf
    (catch Throwable _
      {:tag "?", :hash "?", :branch "?", :date "?"})))

(defn- version-info-from-properties-file []
  (when-let [props-file (io/resource "version.properties")]
    (with-open [reader (io/reader props-file)]
      (let [props (java.util.Properties.)]
        (.load props reader)
        (into {} (for [[k v] props]
                   [(keyword k) v]))))))

(def mb-version-info
  "Information about the current version of Metabase.
   This comes from `resources/version.properties` for prod builds and is fetched from `git` via the `./bin/version` script for dev.

     mb-version-info -> {:tag: \"v0.11.1\", :hash: \"afdf863\", :branch: \"about_metabase\", :date: \"2015-10-05\"}"
  (or (if is-prod?
        (version-info-from-properties-file)
        (version-info-from-shell-script))
      ;; if version info is not defined for whatever reason
      {}))

(def ^String mb-version-string
  "A formatted version string representing the currently running application.
   Looks something like `v0.25.0-snapshot (1de6f3f nested-queries-icon)`."
  (let [{:keys [tag hash branch]} mb-version-info]
    (format "%s (%s %s)" tag hash branch)))

(def ^String mb-app-id-string
  "A formatted version string including the word 'Metabase' appropriate for passing along
   with database connections so admins can identify them as Metabase ones.
   Looks something like `Metabase v0.25.0.RC1`."
  (str "Metabase " (mb-version-info :tag)))


;; This only affects dev:
;;
;; If for some wacky reason the test namespaces are getting loaded (e.g. when running via
;; `lein ring` or `lein ring sever`, DO NOT RUN THE EXPECTATIONS TESTS AT SHUTDOWN! THIS WILL NUKE YOUR APPLICATION DB
(try
  (require 'expectations)
  ((resolve 'expectations/disable-run-on-shutdown))
  ;; This will fail if the test dependencies aren't present (e.g. in a JAR situation) which is totally fine
  (catch Throwable _))
