(ns ^:deprecated metabase.db.data-migrations
  "Clojure-land data migration definitions and fns for running them.
  Data migrations are run once when Metabase is first launched.
  Note that there is no locking mechanism for data-migration - thus upon launching Metabase, It's possible
  for a migration to be run multiple times (e.g: when running multiple Metabase instances).

  That said, these migrations should be idempotent, e.g:
     CREATE TABLE IF NOT EXISTS ... -- Good
     CREATE TABLE ...               -- Bad"
  (:require
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


;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !!                                                                                                               !!
;; !!    Please seriously consider whether any new migrations you write here could be written as Liquibase ones     !!
;; !!    (using preConditions where appropriate). Only add things here if absolutely necessary. If you do add       !!
;; !!    do add new ones here, please add them above this warning message, so people will see it in the future.     !!
;; !!                                                                                                               !!
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
