(ns metabase.data-apps.guards.table
  "The data-app guard of the `/api/table` mount of [[metabase.warehouse-schema-rest.api.table]]."
  (:require
   [metabase.data-apps.guard :as guard]
   [metabase.data-apps.guards.card :as guards.card]
   [metabase.data-apps.rules :as rules]))

(set! *warn-on-reflection* true)

(defn- check-table!
  "Checks the table whose ID is the `:id` route param."
  [_request {:keys [id]}]
  (rules/check-table! id))

(defn check-table-metadata!
  "Checks the table whose metadata a `request` asks for, returning the filter of that metadata."
  [request route-params]
  (check-table! request route-params)
  rules/filter-table-metadata)

(defn- check-card-metadata!
  "Checks the card whose metadata as a table a `request` asks for, returning the filter of that metadata."
  [request route-params]
  (guards.card/check-card! request route-params)
  rules/filter-table-metadata)

(defn- check-table-foreign-keys!
  "Checks the table whose foreign keys a `request` asks for, returning the filter of them."
  [request route-params]
  (check-table! request route-params)
  rules/filter-foreign-keys)

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.warehouse-schema-rest.api.table]]."
  {[:get "/:id"]                      check-table!
   [:get "/:id/query_metadata"]       check-table-metadata!
   [:get "/card__:id/query_metadata"] check-card-metadata!
   [:get "/:id/fks"]                  check-table-foreign-keys!})

(def table-guard
  "Ring middleware guarding the data-app requests to the `/api/table` mount."
  (guard/route-guard 'metabase.warehouse-schema-rest.api.table checks))
