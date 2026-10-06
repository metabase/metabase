(ns metabase-enterprise.data-apps.core
  "What other modules may ask the data-apps module: which collections data apps own, what their resource files may
  hold, and the tables those read."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.resource-tables :as resource-tables]
   [metabase-enterprise.data-apps.resource-validation :as resource-validation]
   [potemkin :as p]))

(p/import-vars
 [resource-tables
  record-table-dependencies!]
 [resource-validation
  problems])

(defn resource-collection-ids
  "The IDs of every data app's resource collection."
  []
  (data-apps.db/resource-collection-ids))
