(ns metabase-enterprise.remote-sync.settings
  "The repository remote sync syncs with, its settings, and which collections it syncs."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.protocol :as protocol]
   [metabase-enterprise.remote-sync.protocol.git :as git]
   [metabase.collections.core :as collections]
   [metabase.settings.core :as setting :refer [defsetting]]
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
  (deferred-tru "How long a remote sync task may go without proving its process is alive (via heartbeat, or progress on rows without one) before it is treated as dead and superseded. A slow but live task is never affected.")
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

(defn repository
  "The repository of the remote sync settings."
  []
  (git/repository (setting/get :remote-sync-url) (setting/get :remote-sync-token)))

(defn- token
  "The token `settings` give, the saved one when they give none or give it obfuscated."
  [settings]
  (let [saved (setting/get :remote-sync-token)]
    (if (or (not (contains? settings :remote-sync-token))
            (= (:remote-sync-token settings) (setting/obfuscate-value saved)))
      saved
      (:remote-sync-token settings))))

(defn check-repository!
  "Throws unless the repository at the `:remote-sync-url` of `settings`, the saved one by default, can be reached with
  their token, and has their `:remote-sync-branch` when they give one."
  [settings]
  (let [url (or (:remote-sync-url settings) (setting/get :remote-sync-url))]
    (when (str/blank? url)
      (throw (ex-info (tru "Remote sync is not configured.") {})))
    (when-not (re-find #"^(https?|file)://" url)
      (throw (ex-info (tru "Invalid repository URL: only HTTPS URLs are supported (e.g., https://git-host.example.com/yourcompany/repo.git)")
                      {})))
    (let [branches (protocol/branches (git/repository url (token settings)))
          branch   (:remote-sync-branch settings)]
      (when (and (not (str/blank? branch)) (not (some #{branch} branches)))
        (throw (ex-info (tru "Invalid branch name") {:branch branch}))))))

(def ^:private setting-keys
  [:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch :remote-sync-auto-import
   :remote-sync-transforms])

(defn save!
  "Saves the remote sync `settings`, except those set by environment variables, checking the repository first when they
  change it. A blank URL turns remote sync off; a missing branch is the default branch of the repository."
  [settings]
  (let [settings (into {} (remove #(= :env (setting/get-raw-value-source (key %)))) (select-keys settings setting-keys))]
    (if (and (contains? settings :remote-sync-url) (str/blank? (:remote-sync-url settings)))
      (do (run! #(setting/set! % nil) [:remote-sync-url :remote-sync-token :remote-sync-branch])
          (collections/clear-remote-synced-collection!))
      (do
        (when (some settings [:remote-sync-url :remote-sync-token :remote-sync-branch])
          (check-repository! settings))
        (t2/with-transaction [_conn]
          (doseq [[k v] (assoc settings :remote-sync-token (token settings))]
            (setting/set! k v)))
        (when (and (setting/get :remote-sync-url) (str/blank? (setting/get :remote-sync-branch)))
          (setting/set! :remote-sync-branch (protocol/default-branch (repository))))))))

(defn set-synced-collections!
  "Syncs the collections whose id `collections` maps to true, and their descendants, and stops syncing those it maps to
  false."
  [collections]
  (when (seq collections)
    (when (= :read-only (setting/get :remote-sync-type))
      (throw (ex-info (tru "Cannot change synced collections when remote-sync-type is read-only.") {:status-code 400})))
    (t2/with-transaction [_conn]
      (doseq [[id synced?] collections]
        (collections/set-remote-synced! (remote-sync.db/collection id) synced?)))))
