(ns metabase-enterprise.advanced-config.reset
  "Support for `POST /api/ee/advanced-config/unsafe-init`: wipe every trace of
  instance content — databases, collections, cards, dashboards, permissions,
  and (almost) all settings — then re-initialize from a parsed `config.yml`,
  so the result matches a brand-new instance booted with that file. Built for
  workspace child instances, whose downloadable config carries databases,
  remote-sync settings, and the workspace section.

  What survives a wipe:

  - users, sessions, permission groups, and group memberships — so the calling
    admin stays logged in. Permissions themselves are erased; the magic groups
    get their fresh-instance default grants re-seeded, custom groups keep no
    grants. Personal collections are wiped and lazily recreated on access.
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
  "App-DB tables the bulk wipe never touches: users and their sessions, groups
  and memberships (plus `tenant`, which users belong to), migration and cluster
  infrastructure, and `setting`, which gets a selective delete of its own.
  Quartz tables are matched by their `qrtz` prefix instead."
  #{"databasechangelog" "databasechangeloglock" "metabase_cluster_lock"
    "setting" "core_user" "core_session" "tenant"
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

(defn- quoted ^String [table-name]
  (case (mdb/db-type)
    :mysql (str "`" table-name "`")
    (str \" table-name \")))

(defn- delete-through-models!
  "Delete the rows whose Toucan delete hooks tear down live runtime state that
  the bulk table wipe below would leave dangling: Quartz triggers (database
  sync/analyze schedules, notification and pulse send schedules), database
  connection pools, and orphaned secrets."
  []
  (t2/delete! :model/Notification)
  (t2/delete! :model/Pulse)
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
      (t2/query (str "TRUNCATE TABLE " (str/join ", " (map quoted tables)) " CASCADE"))

      :mysql
      (t2/with-transaction [_conn]
        (t2/query "SET FOREIGN_KEY_CHECKS = 0")
        (try
          (doseq [table tables]
            (t2/query (str "DELETE FROM " (quoted table))))
          (finally
            (t2/query "SET FOREIGN_KEY_CHECKS = 1"))))

      :h2
      (t2/with-transaction [_conn]
        (t2/query "SET REFERENTIAL_INTEGRITY FALSE")
        (try
          (doseq [table tables]
            (t2/query (str "DELETE FROM " (quoted table))))
          (finally
            (t2/query "SET REFERENTIAL_INTEGRITY TRUE")))))))

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
  requires it to exist. Mirrors the migration that creates it on a fresh
  instance."
  []
  (t2/query {:insert-into :collection
             :columns     [:name :slug :entity_id :type]
             :values      [["Trash" "trash" "trashtrashtrashtrasht" "trash"]]}))

(defn- check-can-apply!
  "Fail before the wipe if [[advanced-config.file/initialize!]] would refuse the
  config's non-settings sections for lack of the `:config-text-file` feature.
  The settings section may itself install the premium token, so a config that
  sets `premium-embedding-token` is let through for [[initialize!]] to judge."
  [parsed-config]
  (when (and (some (fn [[section-name _]] (not= section-name :settings))
                   (:config parsed-config))
             (not (get-in parsed-config [:config :settings :premium-embedding-token]))
             (not (premium-features/enable-config-text-file?)))
    (throw (ex-info (tru "Metabase config files require a Premium token with the :config-text-file feature.")
                    {:status-code 402}))))

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
  (log/warn "unsafe-init: wiping all instance content")
  (delete-through-models!)
  (wipe-tables!)
  (wipe-settings!)
  (reseed-default-permissions!)
  (reseed-trash-collection!)
  (mdb/increment-app-db-unique-indentifier!)
  (search/reset-tracking!)
  (advanced-config.file/initialize! parsed-config)
  (search/reindex!)
  (remote-sync/reset-and-import!)
  :ok)
