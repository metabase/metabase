(ns metabase.driver.sql-jdbc.sync
  "Implementations for sync-related driver multimethods for SQL JDBC drivers, using JDBC DatabaseMetaData."
  (:require [metabase.driver.sql-jdbc.sync
             [describe-database :as sync.describe-database]
             [describe-table :as sync.describe-table]
             [interface :as i]]
            [potemkin :as p]))

(comment i/keep-me sync.describe-database/keep-me sync.describe-table/keep-me)

(p/import-vars
 [i
  active-tables
  column->special-type
  database-type->base-type
  excluded-schemas
  fallback-metadata-query
  have-select-privilege?]

 [sync.describe-table
  add-table-pks
  describe-table
  describe-table-fields
  describe-table-fks
  get-catalogs
  pattern-based-database-type->base-type]

 [sync.describe-database
  describe-database
  fast-active-tables
  post-filtered-active-tables])
