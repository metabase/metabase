(ns metabase.config
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.logging :as log]
   [environ.core :as env]
   [metabase.models.setting.interface :as setting.i]
   [metabase.models.setting.macros :refer [defsetting]]
   [metabase.plugins.classloader :as classloader])
  (:import
   (clojure.lang Keyword)
   (java.util UUID)))

;; this existed long before 0.39.0, but that's when it was made public
(def ^{:doc "Indicates whether Enterprise Edition extensions are available" :added "0.39.0"} ee-available?
  (try
    (classloader/require 'metabase-enterprise.core)
    true
    (catch Throwable _
      false)))

(defsetting run-mode
  "Whether we're running in `:prod`, `:dev`, or `:test` mode."
  :visibility :internal
  :setter :none
  :type :keyword
  :default :prod)

(defsetting db-type
  "Application database type for broken-out database details."
  :visibility :internal
  :setter :none
  :type :keyword
  :default :h2)

(defsetting db-file
  "H2 application database file name, excluding the `.mv.db` extension."
  :visibility :internal
  :setter :none
  :type :string
  :default "metabase.db")

(defsetting db-automigrate
  "Whether to automatically migrate the application database on launch."
  :visibility :internal
  :setter :none
  :type :boolean
  :default true)

(defsetting jetty-port
  "Port to use for the Jetty web server."
  :visibility :internal
  :setter :none
  :type :integer
  :default 3000)

(defsetting jetty-join
  "Whether the Jetty web server should block the main thread on launch. If `false`, Metabase will shut down after the
  Jetty web server is instantiated. The main reason you'd want to do this is to profile launch times."
  :visibility :internal
  :setter :none
  :type :boolean
  :default true)

(defsetting password-complexity
  "Password complexity requirement to use when setting new User passwords."
  :visibility :internal
  :setter :none
  :type :keyword
  :default :normal)

(defsetting version-info-url
  "URL to fetch the list of new OSS versions of Metabase from. Used to display 'there is a new version available' in the
  GUI."
  :visibility :internal
  :setter :none
  :type :string
  :default "https://static.metabase.com/version-info.json")

(defsetting version-info-ee-url
  "URL to fetch the list of new EE versions of Metabase from. Used to display 'there is a new version available' in the
  GUI."
  :visibility :internal
  :setter :none
  :type :string
  :default "https://static.metabase.com/version-info-ee.json")

(defsetting ns-trace
  "Comma-separated list of namespaces to trace."
  :visibility :internal
  :setter :none
  :type :string
  :default nil)

(defsetting max-session-age
  "Session length in minutes (by default, 14 days). For historic reasons, this can be set with the legacy env var
  `MAX_SESSION_AGE` in addition to `MB_MAX_SESSION_AGE`."
  :visibility :internal
  :setter :none
  :type :integer
  :default 20160
  :getter (fn []
            (or (some-> (get env/env :max-session-age) Integer/parseUnsignedInt)
                (setting.i/get-value-of-type :integer :max-session-age))))

(defsetting colorize-logs
  "Whether to include colors in log messages."
  :visibility :internal
  :setter :none
  :type :boolean
  :default false)

(defsetting emoji-in-logs
  "Whether to include emoji in log messages."
  :visibility :internal
  :setter :none
  :type :boolean
  :default false)

(defsetting qp-cache-backend
  "Backend to use for cached Query Processor results. Currently, only the `:db` backend exists.
  See [[metabase.query-processor.middleware.cache]] for more information."
  :visibility :internal
  :setter :none
  :type :keyword
  :default :db)

(defsetting embed-max-session-age
  "EE-only. How long a FULL APP EMBED session is valid for. One day, by default. For historic reasons, you can use the
  legacy env var `EMBED_MAX_SESSION_AGE` instead of `MB_EMBED_MAX_SESSION_AGE`."
  :visibility :internal
  :setter :none
  :type :integer
  :default 1440
  :getter (fn []
            (or (some-> (get env/env :embed-max-session-age) Integer/parseUnsignedInt)
                (setting.i/get-value-of-type :integer :embed-max-session-age))))

(defsetting session-cookie-samesite
  "Session cookie `Same-Site` policy. See [[metabase.server.middleware.session]]."
  :visibility :internal
  :setter :none
  :type :keyword
  :default :lax)

(def ^Boolean is-dev?  "Are we running in `dev` mode (i.e. in a REPL or via `clojure -M:run`)?" (= (run-mode) :dev))
(def ^Boolean is-prod? "Are we running in `prod` mode (i.e. from a JAR)?"                       (= (run-mode) :prod))
(def ^Boolean is-test? "Are we running in `test` mode (i.e. via `clojure -X:test`)?"            (= (run-mode) :test))

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
