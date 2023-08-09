(ns ^:deprecated metabase.db.data-migrations
  "Clojure-land data migration definitions and fns for running them.
  Data migrations are run once when Metabase is first launched.
  Note that there is no locking mechanism for data-migration - thus upon launching Metabase, It's possible
  for a migration to be run multiple times (e.g: when running multiple Metabase instances).

  That said, these migrations should be idempotent, e.g:
     CREATE TABLE IF NOT EXISTS ... -- Good
     CREATE TABLE ...               -- Bad"
  (:require
   [cheshire.core :as json]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.db.query :as mdb.query]
   [metabase.models.dashboard-card :refer [DashboardCard]]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.setting :as setting :refer [Setting]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; # Migration Helpers
(def DataMigrations
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/DataMigrations)

(methodical/defmethod t2/table-name :model/DataMigrations [_model] :data_migrations)
(derive :model/DataMigrations :metabase/model)

(defn- ^:deprecated run-migration-if-needed!
  "Run migration defined by `migration-var` if needed. `ran-migrations` is a set of migrations names that have already
  been run.

     (run-migration-if-needed! #{\"migrate-base-types\"} #'set-card-database-and-table-ids)

  Migrations may provide metadata with `:catch?` to indicate if errors should be caught or propagated."
  [ran-migrations migration-var]
  (let [{migration-name :name catch? :catch?} (meta migration-var)
        migration-name (name migration-name)]
    (when-not (contains? ran-migrations migration-name)
      (log/info (format "Running data migration '%s'..." migration-name))
      (try
       (t2/with-transaction [_conn]
        (@migration-var))
       (catch Exception e
         (if catch?
           (log/warn (format "Data migration %s failed: %s" migration-name (.getMessage e)))
           (throw e))))
      (t2/insert! :model/DataMigrations
        :id        migration-name
        :timestamp :%now))))

(def ^:private ^:deprecated data-migrations (atom []))

(defmacro ^:private ^:deprecated defmigration
  "Define a new data migration. This is just a simple wrapper around `defn-` that adds the resulting var to that
  `data-migrations` atom."
  [migration-name & body]
  `(do (defn- ~migration-name [] ~@body)
       (swap! data-migrations conj #'~migration-name)))

(defn ^:deprecated run-all!
  "Run all data migrations defined by `defmigration`."
  []
  (log/info "Running all necessary data migrations, this may take a minute.")
  (let [ran-migrations (t2/select-pks-set :model/DataMigrations)]
    (doseq [migration @data-migrations]
      (run-migration-if-needed! ran-migrations migration)))
  (log/info "Finished running data migrations."))

(defn- raw-setting
  "Get raw setting directly from DB.
  For some reasons during data-migration [[metabase.models.setting/get]] return the default value defined in
  [[metabase.models.setting/defsetting]] instead of value from Setting table."
  [k]
  (t2/select-one-fn :value Setting :key (name k)))

(defn- remove-admin-group-from-mappings-by-setting-key!
  [mapping-setting-key]
  (let [admin-group-id (:id (perms-group/admin))
        mapping        (try
                        (json/parse-string (raw-setting mapping-setting-key))
                        (catch Exception _e
                          {}))]
    (when-not (empty? mapping)
      (t2/update! Setting (name mapping-setting-key)
                  {:value
                   (->> mapping
                        (map (fn [[k v]] [k (filter #(not= admin-group-id %) v)]))
                        (into {})
                        json/generate-string)}))))

(defmigration
  ^{:author "qnkhuat"
    :added  "0.43.0"
    :doc    "In the past we have a setting to disable group sync for admin group when using SSO or LDAP, but it's broken
            and haven't really worked (see #13820).
            In #20991 we remove this option entirely and make sync for admin group just like a regular group.
            But on upgrade, to make sure we don't unexpectedly begin adding or removing admin users:
              - for LDAP, if the `ldap-sync-admin-group` toggle is disabled, we remove all mapping for the admin group
              - for SAML, JWT, we remove all mapping for admin group, because they were previously never being synced
            if `ldap-sync-admin-group` has never been written, getting raw-setting will return a `nil`, and nil could
            also be interpreted as disabled. so checking `(not= x \"true\")` is safer than `(= x \"false\")`."}
  migrate-remove-admin-from-group-mapping-if-needed
  (when (not= (raw-setting :ldap-sync-admin-group) "true")
    (remove-admin-group-from-mappings-by-setting-key! :ldap-group-mappings))
  ;; sso are enterprise feature but we still run this even in OSS in case a customer
  ;; have switched from enterprise -> SSO and stil have this mapping in Setting table
  (remove-admin-group-from-mappings-by-setting-key! :jwt-group-mappings)
  (remove-admin-group-from-mappings-by-setting-key! :saml-group-mappings))

;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !!                                                                                                               !!
;; !!    Please seriously consider whether any new migrations you write here could be written as Liquibase ones     !!
;; !!    (using preConditions where appropriate). Only add things here if absolutely necessary. If you do add       !!
;; !!    do add new ones here, please add them above this warning message, so people will see it in the future.     !!
;; !!                                                                                                               !!
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
