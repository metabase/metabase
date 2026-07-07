(ns metabase.custom-migrations.init
  (:require
   ;; loads the custom-migration classes so Liquibase can instantiate them by name
   [metabase.custom-migrations.sample-database-downgrade]))
