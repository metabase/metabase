(ns metabase.data-apps.guards.database
  "The data-app guard of the `/api/database` mount of [[metabase.warehouses-rest.api]]."
  (:require
   [metabase.data-apps.guards :as guards]
   [metabase.data-apps.guards.util :as guards.util]))

(set! *warn-on-reflection* true)

(defn- filter-databases
  "Returns the filter of the databases a `request` lists."
  [request _route-params]
  (guards/databases-filter request))

(defn- check-database!
  "Checks the database whose ID is the `:id` route param."
  [request {:keys [id]}]
  (guards/check-database! request id))

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.warehouses-rest.api]]."
  {[:get "/"]    filter-databases
   [:get "/:id"] check-database!})

(def database-guard
  "Ring middleware guarding the data-app requests to the `/api/database` mount."
  (guards.util/route-guard 'metabase.warehouses-rest.api checks))
