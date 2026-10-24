(ns metabase.data-apps.guards.field
  "The data-app guard of the `/api/field` mount of [[metabase.warehouse-schema-rest.api.field]]."
  (:require
   [metabase.data-apps.guards :as guards]
   [metabase.data-apps.guards.util :as guards.util]))

(set! *warn-on-reflection* true)

(defn- check-fields!
  "Returns the check of the field whose ID is the `:id` route param, and of the one whose ID is the `other-id-key` route
  param when given."
  [& [other-id-key]]
  (fn [request route-params]
    (guards/check-field! request (:id route-params))
    (when other-id-key
      (guards/check-field! request (get route-params other-id-key)))))

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.warehouse-schema-rest.api.field]]."
  {[:get "/:id"]                        (check-fields!)
   [:get "/:id/values"]                 (check-fields!)
   [:get "/:id/search/:search-id"]      (check-fields! :search-id)
   [:get "/:id/remapping/:remapped-id"] (check-fields! :remapped-id)})

(def field-guard
  "Ring middleware guarding the data-app requests to the `/api/field` mount."
  (guards.util/route-guard 'metabase.warehouse-schema-rest.api.field checks))
