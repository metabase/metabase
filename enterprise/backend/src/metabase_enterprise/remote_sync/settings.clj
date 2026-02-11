(ns metabase-enterprise.remote-sync.settings
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defsetting remote-sync-enabled
  (deferred-tru "Is Git sync currently enabled?")
  :type :boolean
  :visibility :authenticated
  :export? false
  :setter :none
  :getter (fn [] (some? (setting/get :remote-sync-url)))
  :audit :never
  :doc false)

(defsetting remote-sync-branch
  (deferred-tru "The remote branch to sync with, e.g. `main`")
  :type :string
  :visibility :admin
  :encryption :no
  :export? false
  :can-read-from-env? false)

(defsetting remote-sync-token
  (deferred-tru "An Authorization Bearer token allowing access to the git repo over HTTP")
  :type :string
  :visibility :admin
  :doc true
  :export? false
  :sensitive? true
  :encryption :when-encryption-key-set
  :audit :getter
  :can-read-from-env? false)

(defsetting remote-sync-url
  (deferred-tru "The location of your git repository, e.g. https://github.com/acme-inco/metabase.git")
  :type :string
  :visibility :admin
  :encryption :no
  :export? false
  :can-read-from-env? false)

(defsetting remote-sync-type
  (deferred-tru "Git synchronization type - :read-write or :read-only")
  :type :keyword
  :visibility :authenticated
  :export? false
  :encryption :no
  :default :read-only
  :setter (fn [new-value]
            (let [new-value (or new-value :read-only)
                  valid-types #{:read-only :read-write}
                  value (or (valid-types (keyword new-value))
                            (throw (ex-info "Remote-sync-type set to an unsupported value"
                                            {:value new-value
                                             :options (seq valid-types)})))]
              (setting/set-value-of-type! :keyword :remote-sync-type value)))
  :can-read-from-env? false)

(defsetting remote-sync-auto-import
  (deferred-tru "Whether to automatically import from the remote git repository. Only applies if remote-sync-type is :read-only.")
  :type :boolean
  :visibility :authenticated
  :export? false
  :encryption :no
  :default false)

(defsetting remote-sync-auto-import-rate
  (deferred-tru "If remote-sync-type is :read-only and remote-sync-auto-import is true, the rate (in minutes) at which to check for updates to import. Defaults to 5.")
  :type :integer
  :visibility :authenticated
  :export? false
  :encryption :no
  :default 5)

(defsetting remote-sync-task-time-limit-ms
  (deferred-tru "The maximum amount of time a remote sync task will be given to complete")
  :type :integer
  :visibility :authenticated
  :export? false
  :encryption :no
  :default (* 1000 60 5))

(defn check-git-settings!
  "Validates git repository settings by attempting to connect and retrieve the default branch.

  If no args are passed, it validates the current settings.

  Throws ExceptionInfo if unable to connect to the repository with the provided settings."
  ([] (when (setting/get :remote-sync-enabled) (check-git-settings! {:remote-sync-url    (setting/get :remote-sync-url)
                                                                     :remote-sync-token  (setting/get :remote-sync-token)
                                                                     :remote-sync-branch (setting/get :remote-sync-branch)
                                                                     :remote-sync-type   (setting/get :remote-sync-type)})))

  ([{:keys [remote-sync-url remote-sync-token remote-sync-branch remote-sync-type]}]
   (when-not (or (not (str/index-of remote-sync-url ":"))
                 (str/starts-with? remote-sync-url "file://")
                 (and (or (str/starts-with? remote-sync-url "http://")
                          (str/starts-with? remote-sync-url "https://"))
                      (str/index-of remote-sync-url "github.com")))
     (throw (ex-info "Invalid Repository URL format"
                     {:url remote-sync-url})))

   (let [source (git/git-source remote-sync-url "HEAD" remote-sync-token)]
     (when (and (= :read-only remote-sync-type) (not (str/blank? remote-sync-branch)) (not (some #{remote-sync-branch} (git/branches source))))
       (throw (ex-info "Invalid branch name" {:url remote-sync-url :branch remote-sync-branch}))))))

(defn check-and-update-remote-settings!
  "Validates and updates git sync settings in the application database.

  Takes a settings map containing :remote-sync-url, :remote-sync-token, :remote-sync-type, :remote-sync-branch, and
  :remote-sync-auto-import keys. If the URL is blank, clears all git sync settings (url, token, and branch).
  Otherwise, validates the settings by connecting to the repository, then updates the settings in a transaction.

  If the token is obfuscated (matches the existing token), preserves the existing token value rather than
  overwriting it. If no branch is specified, uses the repository's default branch.

  Throws ExceptionInfo if the git settings are invalid or if unable to connect to the repository."
  [{:keys [remote-sync-url remote-sync-token] :as settings}]
  (if (and (contains? settings :remote-sync-url)
           (str/blank? remote-sync-url))
    (t2/with-transaction [_conn]
      (setting/set! :remote-sync-url nil)
      (setting/set! :remote-sync-token nil)
      (setting/set! :remote-sync-branch nil))
    (let [current-token (setting/get :remote-sync-token)
          obfuscated? (= remote-sync-token (setting/obfuscate-value current-token))
          token-to-check (if obfuscated? current-token remote-sync-token)
          _ (check-git-settings! (assoc settings :remote-sync-token token-to-check))]
      (t2/with-transaction [_conn]
        (doseq [k [:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch :remote-sync-auto-import]]
          (when (and (contains? settings k)
                     (not (and (= k :remote-sync-token) obfuscated?)))
            (setting/set! k (k settings))))))))
