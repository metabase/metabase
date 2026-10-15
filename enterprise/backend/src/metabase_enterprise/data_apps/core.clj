(ns metabase-enterprise.data-apps.core
  "What other modules may ask the data-apps module: what the files of an app's collection may hold, and the tables
  those read."
  (:require
   [metabase-enterprise.data-apps.resource-tables :as resource-tables]
   [metabase-enterprise.data-apps.resource-validation :as resource-validation]
   [potemkin :as p]))

(p/import-vars
 [resource-tables
  record-table-dependencies!]
 [resource-validation
  problems
  warnings])
