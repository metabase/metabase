(ns metabase.data-apps.guards.sandbox-table
  "The data-app guard of the EE `/api/table` mount of `metabase-enterprise.sandbox.api.table`, which replaces table
  metadata under sandboxing."
  (:require
   [metabase.data-apps.guards.table :as guards.table]
   [metabase.data-apps.guards.util :as guards.util]))

(set! *warn-on-reflection* true)

(def checks
  "The checks of a data-app request to each endpoint of `metabase-enterprise.sandbox.api.table`."
  {[:get "/:id/query_metadata"] guards.table/check-table!})

(def sandbox-table-guard
  "Ring middleware guarding the data-app requests to the EE `/api/table` mount."
  (guards.util/route-guard 'metabase-enterprise.sandbox.api.table checks))
