(ns metabase.data-apps.guards.table
  "The data-app guard of the `/api/table` mount of [[metabase.warehouse-schema-rest.api.table]]."
  (:require
   [metabase.data-apps.guards :as guards]
   [metabase.data-apps.guards.util :as guards.util]))

(set! *warn-on-reflection* true)

(defn check-table!
  "Checks the table whose ID is the `:id` route param."
  [request {:keys [id]}]
  (guards/check-table! request id))

(defn- check-card-table!
  "Checks the card whose metadata as a table, under the ID `card__<id>`, a `request` asks for."
  [request {:keys [id]}]
  (guards/check-card! request id))

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.warehouse-schema-rest.api.table]]."
  {[:get "/:id"]                      check-table!
   [:get "/:id/query_metadata"]       check-table!
   [:get "/card__:id/query_metadata"] check-card-table!})

(def table-guard
  "Ring middleware guarding the data-app requests to the `/api/table` mount."
  (guards.util/route-guard 'metabase.warehouse-schema-rest.api.table checks))
