(ns metabase.sample-data.init
  (:require
   ;; loads the RestoreH2SampleDatabaseOnDowngrade Liquibase custom-migration class
   [metabase.sample-data.downgrade]
   [metabase.sample-data.settings]))
