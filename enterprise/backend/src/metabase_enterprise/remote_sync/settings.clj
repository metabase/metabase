(ns metabase-enterprise.remote-sync.settings
  "The repository remote sync syncs with, saving its settings, and which collections it syncs."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.dependencies :as remote-sync.dependencies]
   [metabase-enterprise.remote-sync.protocol :as protocol]
   [metabase-enterprise.remote-sync.protocol.git :as git]
   [metabase.collections.core :as collections]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defsetting remote-sync-enabled
  (deferred-tru "Whether remote sync is on, which it is when a repository URL is set.")
  :feature :remote-sync
  :type :boolean
  :visibility :authenticated
  :export? false
  :setter :none
  :getter (fn [] (some? (setting/get :remote-sync-url)))
  :audit :never
  :doc false)

(defsetting remote-sync-branch
  (deferred-tru "The branch of the repository to sync with, such as `main`.")
  :feature :remote-sync
  :type :string
  :visibility :admin
  :encryption :when-encryption-key-set
  :export? false
  :can-read-from-env? true)

(defsetting remote-sync-token
  (deferred-tru "An access token for the git repository, such as a personal access token.")
  :feature :remote-sync
  :type :string
  :visibility :admin
  :doc true
  :export? false
  :sensitive? true
  :encryption :when-encryption-key-set
  :audit :getter
  :can-read-from-env? true)

(defsetting remote-sync-url
  (deferred-tru "The URL of the git repository to sync with, such as `https://github.com/acme-inco/metabase.git`.")
  :feature :remote-sync
  :type :string
  :visibility :admin
  :encryption :when-encryption-key-set
  :export? false
  :can-read-from-env? true)

(defsetting remote-sync-type
  (deferred-tru "Whether this instance pushes synced content to the repository (read-write) or only pulls it (read-only).")
  :feature :remote-sync
  :type :keyword
  :visibility :authenticated
  :export? false
  :encryption :no
  :default :read-only
  :setter (fn [new-value]
            (let [new-value (or new-value :read-only)
                  valid-types #{:read-only :read-write}
                  value (or (valid-types (keyword new-value))
                            (throw (ex-info (tru "The remote sync type must be read-only or read-write.")
                                            {:value new-value
                                             :options (seq valid-types)})))]
              (setting/set-value-of-type! :keyword :remote-sync-type value)))
  :can-read-from-env? true)

(defsetting remote-sync-auto-import
  (deferred-tru "Whether a read-only instance pulls changes from the repository on a schedule.")
  :feature :remote-sync
  :type :boolean
  :visibility :authenticated
  :export? false
  :encryption :no
  :default false)

(defsetting remote-sync-auto-import-rate
  (deferred-tru "How often, in minutes, a read-only instance that pulls automatically checks the repository for changes.")
  :feature :remote-sync
  :type :integer
  :visibility :authenticated
  :export? false
  :encryption :no
  :default 5)

(defsetting remote-sync-task-time-limit-ms
  (deferred-tru "How long, in milliseconds, a remote sync task can go without a sign that it is still running before Metabase ends it.")
  :feature :remote-sync
  :type :integer
  :visibility :authenticated
  :export? false
  :encryption :no
  :default (* 1000 60 5))

(defsetting remote-sync-git-timeout-seconds
  (deferred-tru "How long, in seconds, remote sync waits for the git repository to respond.")
  :feature :remote-sync
  :type :integer
  :visibility :authenticated
  :export? false
  :encryption :no
  :default 60)

(defenterprise read-only?
  "Whether remote sync is on and keeps the rows it syncs read-only."
  :feature :remote-sync
  []
  (boolean (and (remote-sync-enabled) (= :read-only (remote-sync-type)))))

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
      (throw (ex-info (tru "Remote sync isn''t set up.") {})))
    (when-not (or (not (str/includes? url ":")) (re-find #"^(https?|file)://" url))
      (throw (ex-info (tru "Use an HTTPS repository URL, such as https://github.com/your-org/your-repo.git.")
                      {})))
    (let [branches (protocol/branches (git/repository url (token settings)))
          branch   (:remote-sync-branch settings)]
      (when (and (not (str/blank? branch)) (not (some #{branch} branches)))
        (throw (ex-info (tru "The repository has no branch {0}." branch) {:branch branch}))))))

(def ^:private setting-keys
  [:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch :remote-sync-auto-import])

(defn save!
  "Saves the remote sync `settings`, except those set by environment variables, checking the repository first when they
  change it, turning remote sync off for a blank URL and syncing the default branch when they name none."
  [settings]
  (let [settings (into {} (remove #(= :env (setting/get-raw-value-source (key %)))) (select-keys settings setting-keys))]
    (if (and (contains? settings :remote-sync-url) (str/blank? (:remote-sync-url settings)))
      (do (run! #(setting/set! % nil) [:remote-sync-url :remote-sync-token :remote-sync-branch])
          (collections/clear-remote-synced-collection!))
      (do
        (when (some settings [:remote-sync-url :remote-sync-token :remote-sync-branch])
          (check-repository! settings))
        (t2/with-transaction [_conn]
          (doseq [[k v] (cond-> settings
                          (not= :env (setting/get-raw-value-source :remote-sync-token))
                          (assoc :remote-sync-token (token settings)))]
            (setting/set! k v)))
        (when (and (setting/get :remote-sync-url) (str/blank? (setting/get :remote-sync-branch)))
          (setting/set! :remote-sync-branch (protocol/default-branch (repository))))))))

(defn set-synced-collections!
  "Syncs the top-level collections whose id `collections` maps to true, and their descendants, and stops syncing those
  it maps to false, refusing a change after which synced content depends on content that isn't synced."
  [collections]
  (when (seq collections)
    (when (= :read-only (setting/get :remote-sync-type))
      (throw (ex-info (tru "You can''t change which collections sync on a read-only instance.") {:status-code 400})))
    (t2/with-transaction [_conn]
      (doseq [[id synced?] collections
              :let [collection (remote-sync.db/collection id)]]
        (when-not (and collection (= "/" (:location collection)) (nil? (:personal_owner_id collection)))
          (throw (ex-info (tru "Only top-level collections that are not personal can be synced.")
                          {:status-code 400 :collection-id id})))
        (collections/set-remote-synced! collection synced?))
      (when-let [dependencies (seq (remote-sync.dependencies/unsynced-dependencies))]
        (throw (ex-info (tru "Synced content uses content that isn''t synced.")
                        {:status-code 400 :unsynced-dependencies dependencies}))))))
