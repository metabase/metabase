(ns metabase-enterprise.advanced-config.reset
  "Support for `POST /api/ee/advanced-config/unsafe-init`: wipe every trace of
  instance content — databases, collections, cards, dashboards, permissions,
  and (almost) all settings — then re-initialize from a parsed `config.yml`,
  so the result matches a brand-new instance booted with that file. Built for
  workspace child instances, whose downloadable config carries databases,
  remote-sync settings, and the workspace section.

  What survives a wipe:

  - users, their login credentials (`auth_identity`), sessions, API keys,
    permission groups, and group memberships — so the calling admin stays
    logged in, everyone's password keeps working, and the API key used to
    trigger the wipe keeps authenticating. Permissions themselves are erased;
    the magic groups get their fresh-instance default grants re-seeded, custom
    groups keep no grants. Personal collections are wiped and lazily recreated
    on access.
  - instance identity, licensing, and encryption settings ([[preserved-settings]])
  - infrastructure tables: the Liquibase changelog, Quartz, and the cluster lock

  Audit/instance-analytics content is wiped along with everything else. Since
  `last-analytics-checksum` is wiped too, that content is re-loaded on the next
  restart."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.remote-sync.core :as remote-sync]
   [metabase.app-db.core :as mdb]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.search.core :as search]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private preserved-settings
  "Setting rows that survive a wipe: instance identity, licensing, encryption
  verification, and settings-cache bookkeeping."
  ["premium-embedding-token"
   "site-url"
   "site-uuid"
   "site-uuid-for-premium-features-token-checks"
   "site-uuid-for-unsubscribing-url"
   "site-uuid-for-version-info-fetching"
   "setup-token"
   "encryption-check"
   "settings-last-updated"])

(def ^:private preserved-tables
  "App-DB tables the bulk wipe never touches: users with their login
  credentials, sessions, and API keys (`auth_identity` is where password
  authentication actually lives, and `core_session` has an FK to it that would
  cascade), groups and memberships (plus `tenant`, which users belong to),
  migration and cluster infrastructure, and `setting`, which gets a selective
  delete of its own. Quartz tables are matched by their `qrtz` prefix instead."
  #{"databasechangelog" "databasechangeloglock" "metabase_cluster_lock"
    "setting" "core_user" "core_session" "auth_identity" "api_key" "tenant"
    "permissions_group" "permissions_group_membership"})

(defn- preserved-table? [table-name]
  (let [table-name (u/lower-case-en table-name)]
    (or (contains? preserved-tables table-name)
        (str/starts-with? table-name "qrtz"))))

(defn- app-db-tables
  "Names of all base tables in the application database, cased as
  information_schema reports them (so quoting them back is always valid)."
  []
  (let [schema-clause (case (mdb/db-type)
                        :postgres "table_schema = current_schema()"
                        :mysql    "table_schema = database()"
                        :h2       "table_schema = 'PUBLIC'")]
    (->> (t2/query (str "SELECT table_name FROM information_schema.tables"
                        " WHERE table_type = 'BASE TABLE' AND " schema-clause))
         (map (comp str first vals)))))

(defn- release-workspace-databases!
  "Clear the provisioning state on every `workspace_database` row so the
  `:model/Database` before-delete hook doesn't refuse the delete over a
  `:provisioning`/`:provisioned`/`:deprovisioning` reference. The wipe discards
  workspace rows wholesale, so the warehouse schemas they point at are abandoned
  rather than torn down — no warehouse DDL is issued."
  []
  (t2/query {:update :workspace_database
             :set    {:status "unprovisioned"}}))

(defn- delete-through-models!
  "Delete the rows whose Toucan delete hooks tear down live runtime state that
  the bulk table wipe below would leave dangling: Quartz triggers (database
  sync/analyze schedules, notification and pulse send schedules), database
  connection pools, and orphaned secrets."
  []
  (t2/delete! :model/Notification)
  (t2/delete! :model/Pulse)
  (release-workspace-databases!)
  (t2/delete! :model/Database))

(defn- wipe-tables!
  "Empty every app-DB table except the preserved ones. Postgres gets a single
  `TRUNCATE ... CASCADE` statement; H2 and MySQL delete table-by-table with
  referential checks suspended, inside a transaction so the session flag and the
  deletes share one connection."
  []
  (when-let [tables (seq (remove preserved-table? (app-db-tables)))]
    (case (mdb/db-type)
      :postgres
      (t2/query (str "TRUNCATE TABLE "
                     (str/join ", " (map mdb/quote-for-application-db tables))
                     " CASCADE"))

      (:mysql :h2)
      (let [[disable-sql enable-sql] (case (mdb/db-type)
                                       :mysql ["SET FOREIGN_KEY_CHECKS = 0" "SET FOREIGN_KEY_CHECKS = 1"]
                                       :h2    ["SET REFERENTIAL_INTEGRITY FALSE" "SET REFERENTIAL_INTEGRITY TRUE"])]
        (t2/with-transaction [_conn]
          (t2/query disable-sql)
          (try
            (doseq [table tables]
              (t2/query (str "DELETE FROM " (mdb/quote-for-application-db table))))
            (finally
              (t2/query enable-sql))))))))

(defn- wipe-settings! []
  (t2/query {:delete-from :setting
             :where       [:not-in :key preserved-settings]}))

(defn- reseed-default-permissions!
  "Re-seed the default grants a fresh instance gives the magic groups; the bulk
  wipe emptied the permissions table. Inserts raw rows: the Permissions model
  deliberately refuses admin-group and root-path writes, but these are exactly
  the rows migrations seed on a fresh instance."
  []
  (t2/query {:insert-into :permissions
             :columns     [:group_id :object]
             :values      (into [[(:id (perms/admin-group)) "/"]]
                                (for [object ["/collection/root/"
                                              "/application/subscription/"
                                              "/collection/namespace/snippets/root/"]]
                                  [(:id (perms/all-users-group)) object]))}))

(defn- reseed-trash-collection!
  "Recreate the Trash collection the bulk wipe deleted — collection code fatally
  requires it to exist — and grant every non-admin group access to it. Mirrors
  the migration that seeds both on a fresh instance."
  []
  (t2/query {:insert-into :collection
             :columns     [:name :slug :entity_id :type]
             :values      [["Trash" "trash" "trashtrashtrashtrasht" "trash"]]})
  (let [trash-id  (:id (t2/query-one {:select [:id] :from [:collection] :where [:= :type "trash"]}))
        admin-id  (:id (perms/admin-group))
        group-ids (map :id (t2/query {:select [:id]
                                      :from   [:permissions_group]
                                      :where  [:not= :id admin-id]}))]
    (when (seq group-ids)
      (t2/query {:insert-into :permissions
                 :columns     [:object :group_id]
                 :values      (for [group-id group-ids]
                                [(str "/collection/" trash-id "/") group-id])}))))

(defn- config-grants-config-text-file?
  "Whether the config's non-settings sections are allowed to load: either the
  running instance already has the `:config-text-file` feature, or the config
  installs its own `premium-embedding-token` that validates and grants it. The
  config's token is validated remotely because it is not the active token yet;
  any validation failure is treated as not granting the feature."
  [parsed-config]
  (if-let [config-token (get-in parsed-config [:config :settings :premium-embedding-token])]
    (boolean
     (try
       (let [{:keys [valid features]} (premium-features/check-token config-token)]
         (and valid (contains? (set features) "config-text-file")))
       (catch Throwable _ false)))
    (premium-features/enable-config-text-file?)))

(defn- check-can-apply!
  "Fail before the wipe if [[advanced-config.file/initialize!]] would refuse the
  config's non-settings sections for lack of the `:config-text-file` feature."
  [parsed-config]
  (when (and (some (fn [[section-name _]] (not= section-name :settings))
                   (:config parsed-config))
             (not (config-grants-config-text-file? parsed-config)))
    (throw (ex-info (tru "Metabase config files require a Premium token with the :config-text-file feature.")
                    {:status-code 402}))))

(defn- ensure-no-active-remote-sync-import!
  "Refuse the wipe while a remote-sync import is running: the wipe truncates
  `remote_sync_task`, which would strand that import racing on a freshly wiped
  DB."
  []
  (when (remote-sync/active-import-running?)
    (throw (ex-info (tru "A remote sync task is in progress; try again once it finishes.")
                    {:status-code 409}))))

(defn wipe-and-initialize!
  "DESTRUCTIVE. Erase all content from this instance — users, sessions, groups,
  and memberships survive, so the calling admin stays logged in — then apply
  `parsed-config` as if it were the `config.yml` of a brand-new instance.
  Validates the config (and the premium feature it needs) before deleting
  anything. After initializing, rebuilds the search index and, when the applied
  settings configure remote sync, starts an initial import from the configured
  branch."
  [parsed-config]
  (advanced-config.file/validate-config parsed-config)
  (check-can-apply! parsed-config)
  (ensure-no-active-remote-sync-import!)
  (log/warn "unsafe-init: wiping all instance content")
  (delete-through-models!)
  (wipe-tables!)
  (wipe-settings!)
  (reseed-default-permissions!)
  (reseed-trash-collection!)
  ;; the app DB's contents were replaced wholesale; drop every in-process cache keyed on the old identifier so stale
  ;; entries (the Settings cache included) don't survive the wipe
  (mdb/rotate-app-db-unique-identifier!)
  (search/reset-tracking!)
  (advanced-config.file/initialize! parsed-config)
  (search/reindex!)
  ;; a failed initial import must not undo an otherwise successful wipe + re-initialization
  (try
    (remote-sync/reset-and-import!)
    (catch Throwable e
      (log/error e "unsafe-init: initial remote-sync import failed after wipe and re-initialization")))
  :ok)
