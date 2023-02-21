(ns metabase.db.custom-migrations
  (:require
   [clojure.set :as set]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]
   [toucan2.execute :as t2.execute])
  (:import
   (liquibase.change.custom CustomTaskChange CustomTaskRollback)
   (liquibase.database.jvm JdbcConnection)
   (liquibase.exception ValidationErrors)))

(set! *warn-on-reflection* true)

(defmacro def-reversible-migration
  "Define a reversible custom migration. Both the forward and reverse migrations are defined using the same structure,
  similar to the bodies of multi-arity Clojure functions.

  The first thing in each migration body must be a one-element vector containing a binding to use for the database
  object provided by Liquibase, so that migrations have access to it if needed. This should typically not be used
  directly, however, because is also set automatically as the current connection for Toucan 2.

  Example:

  ```clj
  (def-reversible-migration ExampleMigrationName
   ([_database]
    (migration-body))

   ([_database]
    (migration-body)))"
  [name [[db-binding-1] & migration-body] [[db-binding-2] reverse-migration-body]]
  `(defrecord ~name []
     CustomTaskChange
     (execute [_# database#]
       (binding [toucan2.connection/*current-connectable* (.getWrappedConnection ^JdbcConnection (.getConnection database#))]
         (let [~db-binding-1 database#]
           ~@migration-body)))
     (getConfirmationMessage [_#]
       (str "Custom migration: " ~name))
     (setUp [_#])
     (validate [_# _database#]
       (ValidationErrors.))
     (setFileOpener [_# _resourceAccessor#])

     CustomTaskRollback
     (rollback [_# database#]
       (binding [toucan2.connection/*current-connectable* (.getWrappedConnection ^JdbcConnection (.getConnection database#))]
         (let [~db-binding-2 database#]
           ~@reverse-migration-body)))))

(defn no-op
  "No-op logging rollback function"
  [n]
  (log/info "No rollback for: " n))

(defmacro defmigration
  "Define a custom migration."
  [name migration-body]
  `(def-reversible-migration ~name ~migration-body ([~'_] (no-op ~(str name)))))


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

(def-reversible-migration SplitDataPermissions
  ([_database]
   (let [current-perms-set (t2/select-fn-set
                            (juxt :object :group_id)
                            :models/permissions
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
                              :values      new-v2-perms}))))
  ([_database]
   (t2.execute/query-one {:delete-from :permissions
                          :where [:or [:like :object (h2x/literal "/data/db/%")]
                                      [:like :object (h2x/literal "/query/db/%")]]})))
