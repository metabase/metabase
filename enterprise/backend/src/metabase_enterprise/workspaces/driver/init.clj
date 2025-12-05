(ns metabase-enterprise.workspaces.driver.init
  "Load all workspace driver implementations.
   Require this namespace to ensure all driver methods are registered."
  (:require
   [metabase-enterprise.workspaces.driver.bigquery]
   [metabase-enterprise.workspaces.driver.clickhouse]
   [metabase-enterprise.workspaces.driver.h2]
   [metabase-enterprise.workspaces.driver.postgres]
   [metabase-enterprise.workspaces.driver.redshift]
   [metabase-enterprise.workspaces.driver.snowflake]
   [metabase-enterprise.workspaces.driver.sqlserver]))
