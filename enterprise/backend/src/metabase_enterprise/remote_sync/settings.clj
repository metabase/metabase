(ns metabase-enterprise.remote-sync.settings
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.guards :as guards]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase.collections.models.collection :as collection]
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
  :encryption :when-encryption-key-set
  :export? false
  :can-read-from-env? true)

(defsetting remote-sync-token
  (deferred-tru "An Authorization Bearer token allowing access to the git repo over HTTP")
  :type :string
  :visibility :admin
  :doc true
  :export? false
  :sensitive? true
  :encryption :when-encryption-key-set
  ;; Using remote-sync-url as a simple string so it handles all the non-url style values it could be
  :audience {:remote-sync-url :string}
  :audit :getter
  :can-read-from-env? true)

(defsetting remote-sync-url
  (deferred-tru "The location of your git repository, e.g. `https://github.com/acme-inco/metabase.git`")
  :type :string
  :visibility :admin
  :encryption :when-encryption-key-set
  :export? false
  :can-read-from-env? true)

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
  :can-read-from-env? true)

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

(defsetting remote-sync-git-timeout-seconds
  (deferred-tru "Network timeout (in seconds) for remote git operations such as fetch, push, clone, and ls-remote. A stalled connection would otherwise hang a sync indefinitely.")
  :type :integer
  :visibility :authenticated
  :export? false
  :encryption :no
  :default 60)

(def ^:const transforms-root-id
  "Sentinel value for the virtual Transforms root collection.
   Used to represent the entire transforms feature being enabled/disabled."
  -1)

(defn sync-transform-tracking!
  "Called when remote-sync-transforms setting changes.
   Creates a single 'Transforms' RSO entry with model_id=-1 as a sentinel value.
   When enabled: status is 'create' to indicate transforms should be synced.
   When disabled: status is 'delete' to indicate transforms should be removed.
   When disabling and there's no existing Transforms RSO, does nothing (avoids creating
   spurious 'delete' entries when going from default false to explicitly false)."
  [enabled?]
  (let [timestamp (t/offset-date-time)
        existing-rso (remote-sync.db/rso "Collection" transforms-root-id)]
    (cond
      ;; When enabling, always create/update to 'create' status
      enabled?
      (do
        (when existing-rso
          (remote-sync.db/delete-rso-of! "Collection" transforms-root-id))
        (remote-sync.db/insert-rso! {:model_type        "Collection"
                                     :model_id          transforms-root-id
                                     :model_name        "Transforms"
                                     :status            "create"
                                     :status_changed_at timestamp}))
      ;; When disabling and there's an existing RSO, update to 'delete' status
      existing-rso
      (do
        (remote-sync.db/delete-rso-of! "Collection" transforms-root-id)
        (remote-sync.db/insert-rso! {:model_type        "Collection"
                                     :model_id          transforms-root-id
                                     :model_name        "Transforms"
                                     :status            "delete"
                                     :status_changed_at timestamp}))
      ;; When disabling and there's no existing RSO, do nothing
      ;; (this avoids creating spurious 'delete' entries when going from default false to explicitly false)
      :else
      nil)))

(defn- sync-transform-tracking-on-change
  "Called when remote-sync-transforms setting changes."
  [_old-value new-value]
  ;; new-value may be a string "true"/"false" or a boolean, so we need to parse it
  (let [enabled? (if (string? new-value)
                   (parse-boolean new-value)
                   (boolean new-value))]
    (sync-transform-tracking! enabled?)))

(defsetting remote-sync-transforms
  (deferred-tru "Whether to sync transforms via remote-sync. When enabled, all transforms, transform tags, and transform jobs are synced as a single unit (all-or-nothing).")
  :type :boolean
  :visibility :admin
  :export? false
  :encryption :no
  :default false
  :on-change sync-transform-tracking-on-change)

(defsetting remote-sync-check-changes-cache-ttl-seconds
  (deferred-tru "Time-to-live in seconds for the remote changes check cache. Default is 60 seconds.")
  :type :integer
  :visibility :admin
  :export? false
  :encryption :no
  :default 60)

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
                 (str/starts-with? remote-sync-url "http://")
                 (str/starts-with? remote-sync-url "https://"))
     (throw (ex-info "Invalid repository URL: only HTTPS URLs are supported (e.g., https://git-host.example.com/yourcompany/repo.git)"
                     {:url remote-sync-url})))
   (let [source (git/git-source remote-sync-url "HEAD" remote-sync-token nil)]
     (when (and (= :read-only remote-sync-type) (not (str/blank? remote-sync-branch)) (not (some #{remote-sync-branch} (git/branches source))))
       (throw (ex-info "Invalid branch name" {:url remote-sync-url :branch remote-sync-branch}))))))

(defsetting remote-sync-allow
  (deferred-tru "Allow specific remote sync behaviors. Set to overwrite-unpublished to allow overwriting unpublished changes on startup.")
  :type :string
  :visibility :internal
  :export? false
  :encryption :no
  :doc false)

(def ^:private connection-keys
  "The settings that describe the repository connection. A write touching any of them has to re-check that the
  repository is reachable."
  #{:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch})

(def ^:private writable-keys
  "Every setting [[check-and-update-remote-settings!]] will write, which is [[connection-keys]] plus the ones that
  only affect how syncing behaves once the connection works."
  (into connection-keys [:remote-sync-auto-import :remote-sync-transforms]))

(defn- token-to-check
  "The credential the repository check runs with for a write of `settings`: the stored token when the client echoed
  the mask back or an env var supplies it, otherwise whatever the request names, nil included."
  [{:keys [remote-sync-token]}]
  ;; the stored PAT is a bound Secret, handed through sealed: git-source opens it against the repository it is about
  ;; to contact, so a moved URL is refused there, before JGit is initialized.
  ;;
  ;; Not `value-after-write`, which would also substitute the stored token when the request omits it: a request that
  ;; names no token is checked without one, which is how a repository that needs no credential is configured.
  (if (or (setting/obfuscated-value? remote-sync-token)
          (not (setting/write-visible? :remote-sync-token)))
    (setting/get :remote-sync-token)
    remote-sync-token))

(defn check-and-update-remote-settings!
  "Validates and updates the remote sync settings in the application database.

  Takes a settings map with any of :remote-sync-url, :remote-sync-token, :remote-sync-type, :remote-sync-branch,
  :remote-sync-auto-import and :remote-sync-transforms. If the URL is present and blank, clears the URL, token and
  branch. Otherwise, when any connection setting is present, checks that the repository is reachable, then writes the
  settings with [[metabase.settings.core/set-many!]], skipping any an env var supplies.

  A token that is the mask ([[metabase.settings.core/obfuscated-value?]]) means the stored token stands and is not
  written. When the request omits the branch, the repository check runs against the stored one.

  Throws ExceptionInfo when a task is running, when the repository check fails, or when the URL moves while the stored
  token would be reused: with `:error-code :secret-audience-mismatch` when the mask was echoed back (the repository
  check refuses to open the stored token against the new URL), or `:setting-audience-change-requires-secret` from the
  settings layer when the token was omitted."
  [{:keys [remote-sync-url remote-sync-token] :as settings}]
  (guards/ensure-no-active-task!)
  (let [updating-git-settings? (some connection-keys (keys settings))]
    (if (and (contains? settings :remote-sync-url)
             (str/blank? remote-sync-url))
      (t2/with-transaction [_conn]
        (doseq [k [:remote-sync-url :remote-sync-token :remote-sync-branch]
                :when (setting/write-visible? k)]
          (setting/set! k nil)))
      (let [;; which repository gets checked, independent of the credential: the URL and branch this write leaves
            ;; behind, not the ones the request names, which for an env-supplied value it cannot change
            settings-after-write (merge settings
                                        (setting/values-after-write [:remote-sync-url :remote-sync-branch] settings))
            ;; the client only ever has the mask, and echoes it back when the token was not changed
            obfuscated?          (setting/obfuscated-value? remote-sync-token)]
        (when updating-git-settings?
          (check-git-settings! (assoc settings-after-write :remote-sync-token (token-to-check settings))))
        (setting/set-many!
         (into {}
               ;; a write nothing will read is not worth the row, the audit entry or the on-change handler
               (filter (comp setting/write-visible? key))
               (cond-> (select-keys settings writable-keys)
                 ;; the client echoed the mask back, so the stored token stands and there is nothing to write
                 obfuscated? (dissoc :remote-sync-token))))))))

(defn library-is-remote-synced?
  "Returns true if the Library collection exists and is remote-synced.
   When true, all snippets and snippet collections should be synced."
  []
  (boolean
   (when-let [library (collection/library-collection)]
     (collection/remote-synced-collection? library))))
