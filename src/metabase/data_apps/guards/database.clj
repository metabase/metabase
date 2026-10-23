(ns metabase.data-apps.guards.database
  "The data-app guard of the `/api/database` mount of [[metabase.warehouses-rest.api]]."
  (:require
   [metabase.data-apps.guard :as guard]
   [metabase.data-apps.rules :as rules]))

(set! *warn-on-reflection* true)

(defn- filter-databases
  "Returns the filter of the databases a `request` lists."
  [_request _route-params]
  rules/filter-databases)

(defn- check-database!
  "Checks the database whose ID is the `:id` route param."
  [_request {:keys [id]}]
  (rules/check-database! id))

(defn- check-database-metadata!
  "Checks the database a `request` reads, returning the filter of its tables."
  [request route-params]
  (check-database! request route-params)
  rules/filter-database)

(defn- check-schemas!
  "Checks the database whose schemas a `request` lists, returning the filter of them."
  [request {:keys [id] :as route-params}]
  (check-database! request route-params)
  (partial rules/filter-schemas id))

(defn- check-schema-tables!
  "Checks the database and the schema whose tables a `request` lists, named by a route param or the `schema` query
  param, returning the filter of them."
  [request {:keys [id schema] :as route-params}]
  (check-database! request route-params)
  (rules/check-schema! id (or schema (get-in request [:params :schema])))
  rules/filter-tables)

(defn- check-autocomplete-suggestions!
  "Checks the database whose autocomplete suggestions a `request` asks for, returning the filter of them."
  [request {:keys [id] :as route-params}]
  (check-database! request route-params)
  (partial rules/filter-autocomplete-suggestions id))

(defn- check-card-autocomplete-suggestions!
  "Checks the database whose cards a `request` asks to autocomplete, returning the filter of them."
  [request route-params]
  (check-database! request route-params)
  rules/filter-cards)

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.warehouses-rest.api]]."
  {[:get "/"]                                filter-databases
   [:get "/:id"]                             check-database-metadata!
   [:get "/:id/schemas"]                     check-schemas!
   [:get "/:id/schema/:schema"]              check-schema-tables!
   [:get "/:id/schema/"]                     check-schema-tables!
   [:get "/:id/autocomplete_suggestions"]    check-autocomplete-suggestions!
   [:get "/:id/card_autocomplete_suggestions"] check-card-autocomplete-suggestions!})

(def database-guard
  "Ring middleware guarding the data-app requests to the `/api/database` mount."
  (guard/route-guard 'metabase.warehouses-rest.api checks))
