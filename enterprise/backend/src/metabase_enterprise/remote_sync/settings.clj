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
  :export? false)

(defsetting remote-sync-token
  (deferred-tru "An Authorization Bearer token allowing access to the git repo over HTTP")
  :type :string
  :visibility :admin
  :doc true
  :export? false
  :sensitive? true
  :encryption :when-encryption-key-set
  :audit :getter)

(defsetting remote-sync-url
  (deferred-tru "The location of your git repository, e.g. https://github.com/acme-inco/metabase.git")
  :type :string
  :visibility :admin
  :encryption :no
  :export? false)

(defsetting remote-sync-type
  (deferred-tru "Git synchronization type - :development or :production")
  :type :keyword
  :visibility :authenticated
  :export? false
  :encryption :no
  :default :production
  :setter (fn [new-value]
            (let [new-value (or new-value :production)
                  valid-types #{:production :development}
                  value (or (valid-types (keyword new-value))
                            (throw (ex-info "Remote-sync-type set to an unsupported value"
                                            {:value new-value
                                             :options (seq valid-types)})))]
              (setting/set-value-of-type! :keyword :remote-sync-type value))))

(defsetting remote-sync-auto-import
  (deferred-tru "Whether to automatically import from the remote git repository. Only applies if remote-sync-type is :production.")
  :type :boolean
  :visibility :authenticated
  :export? false
  :encryption :no
  :default false)

(defsetting remote-sync-auto-import-rate
  (deferred-tru "If remote-sync-type is :production and remote-sync-auto-import is true, the rate (in minutes) at which to check for updates to import. Defaults to 5.")
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

(defn- check-git-settings!
  "Validate that git repository settings are correct by attempting to connect.

  Args:
    settings: A map containing:
      - :remote-sync-url - The git repository URL to validate.
      - :remote-sync-token - (Optional) Authentication token for the repository.

  Returns:
    The default branch name of the repository as a string if successful.

  Raises:
    ExceptionInfo: If unable to connect to the git repository with the provided settings."
  [{:keys [remote-sync-url remote-sync-token]}]
  (try
    (git/default-branch (git/git-source remote-sync-url "HEAD" remote-sync-token))
    (catch Exception e
      (throw (ex-info "Unable to connect to git repository with the provided settings" {:cause (.getMessage e)} e)))))

(defn check-and-update-remote-settings!
  "Validate and update git sync settings in the application database.

  This function validates the provided git settings by attempting to connect to the repository.
  If successful, updates the settings in the database. If the URL is blank, clears all git sync settings.

  Args:
    settings: A map containing git sync configuration:
      - :remote-sync-url - The git repository URL. A blank value clears all git sync settings.
      - :remote-sync-token - (Optional) Authentication token. If obfuscated (matches the existing token),
        the existing token is preserved rather than overwritten.
      - :remote-sync-type - (Optional) The sync type (:production or :development).
      - :remote-sync-branch - (Optional) The branch name to sync with.
      - :remote-sync-auto-import - (Optional) Whether to enable automatic imports.

  Returns:
    nil. Updates are performed as side effects to the application database settings.

  Raises:
    ExceptionInfo: If the git settings are invalid or if unable to connect to the repository.

  Notes:
    - When remote-sync-url is blank, clears url, token, and branch settings.
    - When remote-sync-token is obfuscated, preserves the existing token value.
    - If no branch is specified, uses the repository's default branch."
  [{:keys [remote-sync-url remote-sync-token] :as settings}]

  (if (str/blank? remote-sync-url)
    (t2/with-transaction [_conn]
      (setting/set! :remote-sync-url nil)
      (setting/set! :remote-sync-token nil)
      (setting/set! :remote-sync-branch nil))
    (let [current-token (setting/get :remote-sync-token)
          obfuscated? (= remote-sync-token (setting/obfuscate-value current-token))
          token-to-check (if obfuscated? current-token remote-sync-token)
          default-branch (check-git-settings! (assoc settings :remote-sync-token token-to-check))]
      (t2/with-transaction [_conn]
        (doseq [k [:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch :remote-sync-auto-import]]
          (when (not (and (= k :remote-sync-token) obfuscated?))
            (setting/set! k (k settings))))
        (when (nil? (setting/get :remote-sync-branch))
          (setting/set! :remote-sync-branch default-branch))))))
