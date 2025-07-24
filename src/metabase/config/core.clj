(ns metabase.config.core
  (:require
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [environ.core :as env]
   [net.cgrand.macrovich :as macros])
  (:import
   (clojure.lang Keyword)))

(set! *warn-on-reflection* true)

;; this existed long before 0.39.0, but that's when it was made public
(def ^{:doc "Indicates whether Enterprise Edition extensions are available" :added "0.39.0"} ee-available?
  (try
    #_{:clj-kondo/ignore [:metabase/modules]}
    (require 'metabase-enterprise.core.dummy-namespace)
    true
    (catch Throwable _
      false)))

(def tests-available?
  "Whether code from `./test` is available. This is mainly to facilitate certain things like test QP middleware that we
  want to load only when test code is present."
  (try
    #_{:clj-kondo/ignore [:metabase/modules]}
    (require 'metabase.test.dummy-namespace)
    true
    (catch Throwable _
      false)))

(def ^Boolean is-windows?
  "Are we running on a Windows machine?"
  #_{:clj-kondo/ignore [:discouraged-var]}
  (str/includes? (str/lower-case (System/getProperty "os.name")) "win"))

(def ^:private app-defaults
  "Global application defaults"
  {:mb-run-mode                     "prod"
   ;; DB Settings
   :mb-db-type                      "h2"
   :mb-db-file                      "metabase.db"
   :mb-db-automigrate               "true"
   :mb-db-logging                   "true"
   ;; Jetty Settings. Full list of options is available here: https://github.com/ring-clojure/ring/blob/master/ring-jetty-adapter/src/ring/adapter/jetty.clj
   :mb-jetty-port                   "3000"
   :mb-jetty-join                   "true"
   ;; other application settings
   :mb-password-complexity          "normal"
   :mb-version-info-url             "https://static.metabase.com/version-info.json"
   :mb-version-info-ee-url          "https://static.metabase.com/version-info-ee.json"
   :mb-ns-trace                     ""                      ; comma-separated namespaces to trace
   :max-session-age                 "20160"                 ; session length in minutes (14 days)
   :mb-colorize-logs                (str (not is-windows?)) ; since PowerShell and cmd.exe don't support ANSI color escape codes or emoji,
   :mb-emoji-in-logs                (str (not is-windows?)) ; disable them by default when running on Windows. Otherwise they're enabled
   :mb-qp-cache-backend             "db"
   :mb-jetty-async-response-timeout (str (* 10 60 1000))})  ; 10m

;; separate map for EE stuff so merge conflicts aren't annoying.
(def ^:private ee-app-defaults
  {:embed-max-session-age "1440"}) ; how long a FULL APP EMBED session is valid for. One day, by default

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
(defn config-long "Fetch a configuration key and parse it as a Long."     ^Long    [k] (some-> k config-str Long/parseLong))
(defn config-bool "Fetch a configuration key and parse it as a boolean."  ^Boolean [k] (some-> k config-str Boolean/parseBoolean))
(defn config-kw   "Fetch a configuration key and parse it as a keyword."  ^Keyword [k] (some-> k config-str keyword))

(def run-mode
  "The mode in which Metabase is being run"
  (config-kw :mb-run-mode))

(def ^Boolean is-dev?  "Are we running in `dev` mode (i.e. in a REPL or via `clojure -M:run`)?" (= :dev  run-mode))
(def ^Boolean is-prod? "Are we running in `prod` mode (i.e. from a JAR)?"                       (= :prod run-mode))
(def ^Boolean is-test? "Are we running in `test` mode (i.e. via `clojure -X:test`)?"            (= :test run-mode))

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

     mb-version-info -> {:tag: \"v0.11.1\", :hash: \"afdf863\", :date: \"2015-10-05\"}"
  (or (version-info-from-properties-file)
      ;; if version info is not defined for whatever reason
      {:tag "vLOCAL_DEV"
       :hash "06d1ba2ae111e66253209c01c244d6379acfc6dcb1911fa9ab6012cec9ce52e5"}))

(def ^String mb-version-string
  "A formatted version string representing the currently running application.
   Looks something like `v0.25.0-snapshot (1de6f3f nested-queries-icon)`."
  (let [{:keys [tag hash]} mb-version-info]
    (format "%s (%s)" tag hash)))

(def ^String mb-app-id-string
  "A formatted version string including the word 'Metabase' appropriate for passing along
   with database connections so admins can identify them as Metabase ones.
   Looks something like `Metabase v0.25.0.RC1`."
  (str "Metabase " (mb-version-info :tag)))

(defn major-version
  "Detect major version from a version string.
  ex: (major-version \"v1.50.25\") -> 50"
  [version-string]
  (some-> (second (re-find #"\d+\.(\d+)" version-string))
          parse-long))

(defn current-major-version
  "Returns the major version of the running Metabase JAR.
  When the version.properties file is missing (e.g., running in local dev), returns nil."
  []
  (major-version (:tag mb-version-info)))

(defn current-minor-version
  "Returns the minor version of the running Metabase JAR.
  When the version.properties file is missing (e.g., running in local dev), returns nil."
  []
  (some-> (second (re-find #"\d+\.\d+\.(\d+)" (:tag mb-version-info)))
          parse-long))

(defonce ^{:doc "This UUID is randomly-generated upon launch and used to identify this specific Metabase instance during
                this specifc run. Restarting the server will change this UUID, and each server in a horizontal cluster
                will have its own ID, making this different from the `site-uuid` Setting."}
  local-process-uuid
  (str (random-uuid)))

(defonce
  ^{:doc "A string that contains identifying information about the Metabase version and the local process."}
  mb-version-and-process-identifier
  (format "%s [%s]" mb-app-id-string local-process-uuid))

(defn mb-user-defaults
  "Default user details provided as a JSON string at launch time for first-user setup flow."
  []
  (when-let [user-json (env/env :mb-user-defaults)]
    (json/parse-string user-json true)))

(def ^:const internal-mb-user-id
  "The user-id of the internal metabase user.
   This is needed in the OSS edition to filter out users for setup/has-user-setup."
  13371338)

(def ^:dynamic *disable-setting-cache*
  "Whether to disable database cache. Here for loading circularity reasons."
  false)

(defn load-sample-content?
  "Load sample content on fresh installs?
  Using this effectively means `MB_LOAD_SAMPLE_CONTENT` defaults to true."
  []
  (not (false? (config-bool :mb-load-sample-content))))

(def ^:dynamic *request-id*
  "A unique identifier for the current request. This is bound by
  `metabase.server.middleware.request-id/wrap-request-id`."
  nil)

(defmacro build-type-case
  "Sort of like [[macros/case]] but emits different code for dev or release builds. Useful if you want macros to emit
  extra stuff for debugging only in dev builds -- for example [[metabase.util.log]] macros emit extra code for
  capturing logs in tests only in `:dev` builds.

  Accepts the following keys:

  * `:clj/dev` -- form will only be emitted if this is a Clj dev build (running from the REPL or running tests).

  * `:cljs/dev` -- form will only be emitted if this is a Cljs dev build (running Cljs REPL or tests, or was triggered
    by a yarn `build` command other than `build-release`.

  * `:dev` -- form will only be emitted if this is a Clj or Cljs dev build. Cannot be used in combination with
    `:clj/dev` or `:cljs/dev`.

  * `:clj/release` -- form will only be emitted for non-dev Clj builds (i.e. the uberjar or `clj -M:run`) -- whenever
    dev/test code is not available on the classpath)

  * `:cljs/release` -- form will only be emitted for release Cljs builds (i.e., `yarn build-release` and friends)

  * `:release` -- form will be emitted if this is a Clj or Cljs release build. Cannot be used in combination with
  `:clj/release` or `:cljs/release`."
  {:style/indent 0}
  [& {:keys [dev release], cljs-dev :cljs/dev, cljs-release :cljs/release, clj-dev :clj/dev, clj-release :clj/release}]
  (assert (not (and dev (or clj-dev cljs-dev)))
          "Cannot specify dev in combination with clj-dev/cljs-dev")
  (assert (not (and release (or clj-release cljs-release)))
          "Cannot specify release in combination with clj-release/cljs-release")
  (let [build-type (macros/case :clj  (if tests-available?
                                        :clj/dev
                                        :clj/release)
                                :cljs (case (:shadow.build/mode &env)
                                        :dev     :cljs/dev
                                        :release :cljs/release))]
    (case build-type
      :clj/dev      (or dev clj-dev)
      :cljs/dev     (or dev cljs-dev)
      :clj/release  (or release clj-release)
      :cljs/release (or release cljs-release))))
