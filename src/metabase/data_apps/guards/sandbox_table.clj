(ns metabase.data-apps.guards.sandbox-table
  "The data-app guard of the EE `/api/table` mount of `metabase-enterprise.sandbox.api.table`, which replaces table
  metadata under sandboxing."
  (:require
   [metabase.data-apps.guard :as guard]
   [metabase.data-apps.guards.table :as guards.table]))

(set! *warn-on-reflection* true)

(def checks
  "The checks of a data-app request to each endpoint of `metabase-enterprise.sandbox.api.table`."
  {[:get "/:id/query_metadata"] guards.table/check-table-metadata!})

(def sandbox-table-guard
  "Ring middleware guarding the data-app requests to the EE `/api/table` mount."
  (guard/route-guard 'metabase-enterprise.sandbox.api.table checks))
