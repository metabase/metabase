(ns metabase.db.custom-migrations
  (:require [metabase.util.log :as log]
            [toucan.db :as db])
  (:import [liquibase.change.custom CustomTaskChange CustomTaskRollback]
           liquibase.exception.ValidationErrors))

(defmacro def-reversible-migration
  "Define a reversible custom migration."
  [name migration-body reverse-migration-body]
  `(defrecord ~name []
     CustomTaskChange
     (execute [_# _database#]
       ~migration-body)
     (getConfirmationMessage [_#]
       (str "Custom migration: " ~name))
     (setUp [_#])
     (validate [_# _database#]
       (ValidationErrors.))
     (setFileOpener [_# _resourceAccessor#])

     CustomTaskRollback
     (rollback [_# _database#]
       ~reverse-migration-body)))

(defn no-op
  "No-op logging rollback function"
  [n]
  (log/info "No rollback for: " n))

(defmacro defmigration
  "define a custom migration"
  [name migration-body]
  `(def-reversible-migration ~name ~migration-body (no-op ~(str name))))
