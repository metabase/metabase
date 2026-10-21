(ns metabase-enterprise.remote-sync.settings
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.guards :as guards]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase.collections.models.collection :as collection]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.startup.core :as startup]
   [metabase.util.i18n :refer [deferred-tru tru]]
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
  (deferred-tru "How long a remote sync task may go without proving its process is alive (via heartbeat, or progress on rows without one) before it is treated as dead and superseded. A slow but live task is never affected. The task itself is aborted after ten times this limit.")
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

(defsetting remote-sync-transforms
  (deferred-tru "Whether to sync transforms via remote-sync. When enabled, transforms, transform tags, transform tests, Python libraries, and transforms folders are synced.")
  :type :boolean
  :visibility :admin
  :export? false
  :encryption :no
  :default false)

(def ^:private syncable-namespaces
  "The Collection namespaces remote sync syncs without custom collections."
  #{(name collection/transforms-ns) (name collection/snippets-ns) (name collection/data-actions-ns) (name collection/data-apps-ns)})

(defn custom-collection?
  "Whether `collection` is one remote sync syncs only with custom collections on: outside the namespaces it syncs and not of a Library type."
  [collection]
  (not (or (contains? syncable-namespaces (some-> (:namespace collection) name))
           (contains? collection/library-collection-types (:type collection)))))

(defn- custom-collections-synced?
  "Whether a top-level custom collection is remote-synced."
  []
  (boolean (some custom-collection? (remote-sync.db/remote-synced-root-collections))))

(defn check-custom-collections-unsynced!
  "Throws when a top-level custom collection is remote-synced."
  []
  (when (custom-collections-synced?)
    (throw (ex-info (tru "Stop syncing the collections besides the Library, transforms, snippets and data apps before turning off remote-sync-custom-collections-enabled.")
                    {:status-code 400}))))

(defsetting remote-sync-custom-collections-enabled
  (deferred-tru "Whether remote sync can sync collections besides the Library, transforms, snippets and data apps. When off, no other collection can be marked as synced, and a pull or a serialization import refuses content with other synced collections, so set `MB_REMOTE_SYNC_CUSTOM_COLLECTIONS_ENABLED=true` on an instance that pulls or imports such content. It can only be turned off once no other collection is synced.")
  :type :boolean
  :visibility :admin
  :export? false
  :encryption :no
  :default false
  :setter (fn [new-value]
            (when-not (if (string? new-value) (setting/string->boolean new-value) new-value)
              (check-custom-collections-unsynced!))
            (setting/set-value-of-type! :boolean :remote-sync-custom-collections-enabled new-value)))

(defmethod startup/def-startup-validation! ::remote-sync-custom-collections-enabled
  [_]
  (when (and (remote-sync-enabled)
             (not= :default (setting/get-raw-value-source :remote-sync-custom-collections-enabled))
             (not (remote-sync-custom-collections-enabled)))
    (check-custom-collections-unsynced!)))

(defn pin-remote-sync-custom-collections-enabled!
  "Stores [[remote-sync-custom-collections-enabled]] when nothing has set it yet, enabled only where custom collections are already synced."
  []
  (when (= :default (setting/get-raw-value-source :remote-sync-custom-collections-enabled))
    (remote-sync-custom-collections-enabled! (custom-collections-synced?))))

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

(defn check-and-update-remote-settings!
  "Validates and updates git sync settings in the application database.

  Takes a settings map containing :remote-sync-url, :remote-sync-token, :remote-sync-type, :remote-sync-branch, and
  :remote-sync-auto-import keys. If the URL is blank, clears all git sync settings (url, token, and branch).
  Otherwise, validates the settings by connecting to the repository, then updates the settings in a transaction.

  If the token is obfuscated (matches the existing token), preserves the existing token value rather than
  overwriting it. If no branch is specified, uses the repository's default branch.

  Throws ExceptionInfo if the git settings are invalid or if unable to connect to the repository."
  [{:keys [remote-sync-url remote-sync-token] :as settings}]
  (guards/ensure-no-active-task!)
  (let [git-related-keys #{:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch}
        updating-git-settings? (some git-related-keys (keys settings))
        env-set-url    (= :env (setting/get-raw-value-source :remote-sync-url))
        env-set-token  (= :env (setting/get-raw-value-source :remote-sync-token))
        env-set-branch (= :env (setting/get-raw-value-source :remote-sync-branch))]
    (if (and (contains? settings :remote-sync-url)
             (str/blank? remote-sync-url))
      (t2/with-transaction [_conn]
        (when-not env-set-url
          (setting/set! :remote-sync-url nil))
        (when-not env-set-token
          (setting/set! :remote-sync-token nil))
        (when-not env-set-branch
          (setting/set! :remote-sync-branch nil)))
      (let [current-token  (setting/get :remote-sync-token)
            obfuscated?    (= remote-sync-token (setting/obfuscate-value current-token))
            token-to-check (if env-set-token
                             (setting/get :remote-sync-token)
                             (if obfuscated? current-token remote-sync-token))]
        (when updating-git-settings?
          (check-git-settings! (assoc settings :remote-sync-token token-to-check)))
        (t2/with-transaction [_conn]
          (doseq [k [:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch :remote-sync-auto-import :remote-sync-transforms]]
            (when (and (not= :env (setting/get-raw-value-source k)) (contains? settings k)
                       (not (and (= k :remote-sync-token) obfuscated?)))
              (setting/set! k (k settings)))))))))

(defn library-is-remote-synced?
  "Returns true if the Library collection exists and is remote-synced.
   When true, all snippets and snippet collections should be synced."
  []
  (boolean
   (when-let [library (collection/library-collection)]
     (collection/remote-synced-collection? library))))
