(ns metabase.db.custom-migrations
  (:require
   [clojure.set :as set]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.db.connection :as mdb.connection]
   [metabase.plugins.classloader :as classloader]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.execute :as t2.execute])
  (:import
   (liquibase.change.custom CustomTaskChange CustomTaskRollback)
   (liquibase.exception ValidationErrors)
   (org.quartz Scheduler)))

(set! *warn-on-reflection* true)

(defmacro define-reversible-migration
  "Define a reversible custom migration. Both the forward and reverse migrations are defined using the same structure,
  similar to the bodies of multi-arity Clojure functions.

  Example:

  ```clj
  (define-reversible-migration ExampleMigrationName
   (migration-body)
   (reverse-migration-body)))
  ```"
  [name migration-body reverse-migration-body]
  `(defrecord ~name []
     CustomTaskChange
     (execute [_# database#]
       ~migration-body)
     (getConfirmationMessage [_#]
       (str "Custom migration: " ~name))
     (setUp [_#])
     (validate [_# _database#]
       (ValidationErrors.))
     (setFileOpener [_# _resourceAccessor#])

     CustomTaskRollback
     (rollback [_# database#]
       ~reverse-migration-body)))

(defn no-op
  "No-op logging rollback function"
  [n]
  (log/info "No rollback for: " n))

(defmacro define-migration
  "Define a custom migration without a reverse migration."
  [name & migration-body]
  `(define-reversible-migration ~name (do ~@migration-body) (no-op ~(str name))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  MIGRATIONS                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private base-path-regex
  #"^(/db/\d+(?:/schema/(?:(?:[^\\/])|(?:\\/)|(?:\\\\))*(?:/table/\d+?)?)?/)((native/)|(query/(segmented/)?))?$")

(defn- ->v2-paths
  "Converts v1 data permission paths into v2 data and query permissions paths. This is similar to `->v2-path` in
   metabase.models.permissions but somewhat simplified for the migration use case."
  [v1-path]
  (if-let [base-path (second (re-find base-path-regex v1-path))]
    ;; For (almost) all v1 data paths, we simply extract the base path (e.g. "/db/1/schema/PUBLIC/table/1/")
    ;; and construct new v2 paths by adding prefixes to the base path.
    [(str "/data" base-path) (str "/query" base-path)]

    ;; For the specific v1 path that grants full data access but no native query access, we add a
    ;; /schema/ suffix to the corresponding v2 query permission path.
    (when-let [db-id (second (re-find #"^/db/(\d+)/schema/$" v1-path))]
      [(str "/data/db/" db-id "/") (str "/query/db/" db-id "/schema/")])))

(define-reversible-migration SplitDataPermissions
  (let [current-perms-set (t2/select-fn-set
                           (juxt :object :group_id)
                           :metabase.models.permissions/Permissions
                           {:where [:or
                                    [:like :object (h2x/literal "/db/%")]
                                    [:like :object (h2x/literal "/data/db/%")]
                                    [:like :object (h2x/literal "/query/db/%")]]})
        v2-perms-set      (into #{} (mapcat
                                     (fn [[v1-path group-id]]
                                       (for [v2-path (->v2-paths v1-path)]
                                         [v2-path group-id]))
                                     current-perms-set))
        new-v2-perms      (into [] (set/difference v2-perms-set current-perms-set))]
    (when (seq new-v2-perms)
      (t2.execute/query-one {:insert-into :permissions
                             :columns     [:object :group_id]
                             :values      new-v2-perms})))
  (t2.execute/query-one {:delete-from :permissions
                         :where [:or [:like :object (h2x/literal "/data/db/%")]
                                 [:like :object (h2x/literal "/query/db/%")]]}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Quartz Scheduler Helpers                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; This section of code's purpose is to avoid the migration depending on function in the [[metabase.task]] namespace,
;; which is likely to change, and might not have as tight test coverage as needed for custom migrations.

(defonce ^:dynamic ^{:doc "Override the global Quartz scheduler by binding this var."}
  *quartz-scheduler*
  (atom nil))

(defn- scheduler
  "Fetch the instance of our Quartz scheduler."
  ^Scheduler []
  @*quartz-scheduler*)

(defn- load-class ^Class [^String class-name]
  (Class/forName class-name true (classloader/the-classloader)))

(defrecord ^:private ClassLoadHelper []
  org.quartz.spi.ClassLoadHelper
  (initialize [_])
  (getClassLoader [_]
    (classloader/the-classloader))
  (loadClass [_ class-name]
    (load-class class-name))
  (loadClass [_ class-name _]
    (load-class class-name)))

(when-not *compile-files*
  (System/setProperty "org.quartz.scheduler.classLoadHelper.class" (.getName ClassLoadHelper)))

(defn- set-jdbc-backend-properties!
  "Set the appropriate system properties needed so Quartz can connect to the JDBC backend. (Since we don't know our DB
  connection properties ahead of time, we'll need to set these at runtime rather than Setting them in the
  `quartz.properties` file.)"
  []
  (when (= (mdb.connection/db-type) :postgres)
    (System/setProperty "org.quartz.jobStore.driverDelegateClass" "org.quartz.impl.jdbcjobstore.PostgreSQLDelegate")))

;;; +----------------------------------------------------------------------------------------------------------------+

(define-migration DeleteAbandonmentEmailTask
  (classloader/the-classloader)
  (set-jdbc-backend-properties!)
  (let [scheduler (qs/initialize)]
    (qs/start scheduler)
    (qs/delete-trigger scheduler (triggers/key "metabase.task.abandonment-emails.trigger"))
    (qs/delete-job scheduler (jobs/key "metabase.task.abandonment-emails.job"))
    (qs/shutdown scheduler)))
