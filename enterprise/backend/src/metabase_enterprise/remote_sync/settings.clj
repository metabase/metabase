(ns metabase-enterprise.remote-sync.settings
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.guards :as guards]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase.collections.models.collection :as collection]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

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

(defn- planned-writes
  "The setting writes of [[check-and-update-remote-settings!]] of `settings`, as [key value] pairs in write order. A
  blank URL clears the URL, the token and the branch. Leaves out a setting that an env var sets, and a token that
  equals the obfuscated stored token."
  [{:keys [remote-sync-url remote-sync-token] :as settings}]
  (let [obfuscated? (= remote-sync-token (setting/obfuscate-value (setting/get :remote-sync-token)))]
    (into []
          (remove (fn [[k _]] (= :env (setting/get-raw-value-source k))))
          (if (and (contains? settings :remote-sync-url) (str/blank? remote-sync-url))
            [[:remote-sync-url nil] [:remote-sync-token nil] [:remote-sync-branch nil]]
            (for [k     [:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch
                         :remote-sync-auto-import :remote-sync-transforms]
                  :when (and (contains? settings k)
                             (not (and (= k :remote-sync-token) obfuscated?)))]
              [k (get settings k)])))))

(defn check-and-update-remote-settings!
  "Validates and updates git sync settings in the application database.

  Takes a settings map containing :remote-sync-url, :remote-sync-token, :remote-sync-type, :remote-sync-branch, and
  :remote-sync-auto-import keys. If the URL is blank, clears all git sync settings (url, token, and branch).
  Otherwise, validates the settings by connecting to the repository, then updates the settings.

  Writes each setting in its own transaction: one transaction held across several setting writes can deadlock with
  a concurrent multi-setting save (`setting/set-many!`), which takes the settings rows and the settings marker row
  in the opposite order. A failure between two writes leaves the earlier one written.

  If the token is obfuscated (matches the existing token), preserves the existing token value rather than
  overwriting it.

  Throws ExceptionInfo if the git settings are invalid or if unable to connect to the repository, or if a sync
  task is in progress."
  [{:keys [remote-sync-url remote-sync-token] :as settings}]
  (guards/ensure-no-active-task!)
  (let [clearing-url? (and (contains? settings :remote-sync-url) (str/blank? remote-sync-url))
        writes        (planned-writes settings)]
    (when (and (not clearing-url?)
               (some #{:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch} (keys settings)))
      (let [current-token (setting/get :remote-sync-token)]
        (check-git-settings!
         (assoc settings :remote-sync-token
                (if (or (= :env (setting/get-raw-value-source :remote-sync-token))
                        (= remote-sync-token (setting/obfuscate-value current-token)))
                  current-token
                  remote-sync-token)))))
    (doseq [[k v] writes]
      (setting/set! k v))))

(defn library-is-remote-synced?
  "Returns true if the Library collection exists and is remote-synced.
   When true, all snippets and snippet collections should be synced."
  []
  (boolean
   (when-let [library (collection/library-collection)]
     (collection/remote-synced-collection? library))))
