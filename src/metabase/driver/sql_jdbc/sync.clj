(ns metabase.driver.sql-jdbc.sync
  "Implementations for sync-related driver multimethods for SQL JDBC drivers, using JDBC DatabaseMetaData."
  (:require [metabase.driver.sql-jdbc.sync.describe-database :as sync.describe-database]
            [metabase.driver.sql-jdbc.sync.describe-table :as sync.describe-table]
            [metabase.driver.sql-jdbc.sync.interface :as i]
            [potemkin :as p]))

(comment i/keep-me sync.describe-database/keep-me sync.describe-table/keep-me)

(p/import-vars
 [i
  active-tables
  column->semantic-type
  database-type->base-type
  db-default-timezone
  excluded-schemas
  fallback-metadata-query
  have-select-privilege?
  syncable-schemas]

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
