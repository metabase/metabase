(ns metabase.db.custom-migrations
  (:require [metabase.util.log :as log]
            [toucan2.connection :as t2.conn])
  (:import [liquibase.change.custom CustomTaskChange CustomTaskRollback]
           liquibase.exception.ValidationErrors))

(defmacro def-reversible-migration
  "Define a reversible custom migration. Both the forward and reverse migrations are defined using the same structure,
  similar to the bodies of multi-arity Clojure functions. The first thing in each migration body must be a one-element
  vector containing a binding to use for the database object provided by Liquibase, so that migrations have access to
  it if needed. It is also set automatically as the current connection for Toucan 2.

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
       (binding [toucan2.connection/*current-connectable* (.getWrappedConnection (.getConnection database#))]
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
       (binding [toucan2.connection/*current-connectable* (.getWrappedConnection (.getConnection database#))]
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
