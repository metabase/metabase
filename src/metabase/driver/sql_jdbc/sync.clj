(ns metabase.driver.sql-jdbc.sync
  "Implementations for sync-related driver multimethods for SQL JDBC drivers, using JDBC DatabaseMetaData."
  (:require [metabase.driver.sql-jdbc.sync.dbms-version :as sql-jdbc.dbms-version]
            [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
            [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
            [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
            [potemkin :as p]))

(comment sql-jdbc.sync.interface/keep-me sql-jdbc.describe-database/keep-me sql-jdbc.describe-table/keep-me)
