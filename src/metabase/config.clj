(ns metabase.config
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [environ.core :as env]
   [metabase.plugins.classloader :as classloader]
   [metabase.util.log :as log])
  (:import
   (clojure.lang Keyword)
   (java.util UUID)))

(set! *warn-on-reflection* true)

;; this existed long before 0.39.0, but that's when it was made public
(def ^{:doc "Indicates whether Enterprise Edition extensions are available" :added "0.39.0"} ee-available?
  (try
    (classloader/require 'metabase-enterprise.core)
    true
    (catch Throwable _
      false)))

(def ^Boolean is-windows?
  "Are we running on a Windows machine?"
  #_{:clj-kondo/ignore [:discouraged-var]}
  (str/includes? (str/lower-case (System/getProperty "os.name")) "win"))

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
   :mb-version-info-ee-url "http://static.metabase.com/version-info-ee.json"
   :mb-ns-trace            ""                                             ; comma-separated namespaces to trace
   :max-session-age        "20160"                                        ; session length in minutes (14 days)
   :mb-colorize-logs       (str (not is-windows?))                        ; since PowerShell and cmd.exe don't support ANSI color escape codes or emoji,
   :mb-emoji-in-logs       (str (not is-windows?))                        ; disable them by default when running on Windows. Otherwise they're enabled
   :mb-qp-cache-backend    "db"})

;; separate map for EE stuff so merge conflicts aren't annoying.
(def ^:private ee-app-defaults
  {:embed-max-session-age      "1440"   ; how long a FULL APP EMBED session is valid for. One day, by default
   :mb-session-cookie-samesite "lax"})

(alter-var-root #'app-defaults merge ee-app-defaults)

(defn config-str
  "Retrieve value for a single configuration key.  Accepts either a keyword or a string.

   We resolve properties from these places:

   1.  environment variables (ex: MB_DB_TYPE -> :mb-db-type)
   2.  jvm options (ex: -Dmb.db.type -> :mb-db-type)
   3.  hard coded `app-defaults`"
  [k]
  (let [k       (keyword k)
        env-val (k env/env)]
    (or (when-not (str/blank? env-val) env-val)
        (k app-defaults))))


;; These are convenience functions for accessing config values that ensures a specific return type
;;
;; TODO - These names are bad. They should be something like `int`, `boolean`, and `keyword`, respectively. See
;; https://github.com/metabase/metabase/wiki/Metabase-Clojure-Style-Guide#dont-repeat-namespace-alias-in-function-names
;; for discussion
(defn config-int  "Fetch a configuration key and parse it as an integer." ^Integer [k] (some-> k config-str Integer/parseInt))
(defn config-bool "Fetch a configuration key and parse it as a boolean."  ^Boolean [k] (some-> k config-str Boolean/parseBoolean))
(defn config-kw   "Fetch a configuration key and parse it as a keyword."  ^Keyword [k] (some-> k config-str keyword))

(def ^Boolean is-dev?  "Are we running in `dev` mode (i.e. in a REPL or via `clojure -M:run`)?" (= :dev  (config-kw :mb-run-mode)))
(def ^Boolean is-prod? "Are we running in `prod` mode (i.e. from a JAR)?"                       (= :prod (config-kw :mb-run-mode)))
(def ^Boolean is-test? "Are we running in `test` mode (i.e. via `clojure -X:test`)?"            (= :test (config-kw :mb-run-mode)))

;;; Version stuff

(defn- version-info-from-properties-file []
  (when-let [props-file (io/resource "version.properties")]
    (with-open [reader (io/reader props-file)]
      (let [props (java.util.Properties.)]
        (.load props reader)
        (into {} (for [[k v] props]
                   [(keyword k) v]))))))

;; TODO - Can we make this `^:const`, so we don't have to read the file at launch when running from the uberjar?
(def mb-version-info
  "Information about the current version of Metabase. Comes from `version.properties` which is generated by the build
  script.

     mb-version-info -> {:tag: \"v0.11.1\", :hash: \"afdf863\", :branch: \"about_metabase\", :date: \"2015-10-05\"}"
  (or (version-info-from-properties-file)
      ;; if version info is not defined for whatever reason
      {:tag "vLOCAL_DEV"
       :hash "06d1ba2ae111e66253209c01c244d6379acfc6dcb1911fa9ab6012cec9ce52e5"
       :branch "local"}))

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

(defonce ^{:doc "This UUID is randomly-generated upon launch and used to identify this specific Metabase instance during
                this specifc run. Restarting the server will change this UUID, and each server in a horizontal cluster
                will have its own ID, making this different from the `site-uuid` Setting."}
  local-process-uuid
  (str (UUID/randomUUID)))

(defonce
  ^{:doc "A string that contains identifying information about the Metabase version and the local process."}
  mb-version-and-process-identifier
  (format "%s [%s]" mb-app-id-string local-process-uuid))

(defn- mb-session-cookie-samesite*
  []
  #_{:clj-kondo/ignore [:discouraged-var]}
  (let [same-site (str/lower-case (config-str :mb-session-cookie-samesite))]
    (when-not (#{"none", "lax", "strict"} same-site)
      (throw (ex-info "Invalid value for MB_COOKIE_SAMESITE" {:mb-session-cookie-samesite same-site})))
    (keyword same-site)))

(def ^Keyword mb-session-cookie-samesite
  "Value for session cookie's `SameSite` directive. Must be one of \"none\", \"lax\", or \"strict\" (case insensitive)."
  (mb-session-cookie-samesite*))

;; In 0.41.0 we switched from Leiningen to deps.edn. This warning here to keep people from being bitten in the ass by
;; the little gotcha described below.
;;
;; TODO -- after we've shipped 0.43.0, remove this warning. At that point, the last three shipped major releases will
;; all be deps.edn based.
(when (and (not is-prod?)
           (.exists (io/file ".lein-env")))
  ;; don't need to i18n since this is a dev-only warning.
  (log/warn
   (str "Found .lein-env in the project root directory.\n"
        "This file was previously created automatically by the Leiningen lein-env plugin.\n"
        "Environ will use values from it in preference to env var or Java system properties you've specified.\n"
        "You should delete it; it will be recreated as needed when switching to a branch still using Leiningen.\n"
        "See https://github.com/metabase/metabase/wiki/Migrating-from-Leiningen-to-tools.deps#custom-env-var-values for more details.")))

(defn mb-user-defaults
  "Default user details provided as a JSON string at launch time for first-user setup flow."
  []
  (when-let [user-json (env/env :mb-user-defaults)]
    (json/parse-string user-json true)))
