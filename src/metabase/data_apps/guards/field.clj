(ns metabase.data-apps.guards.field
  "The data-app guard of the `/api/field` mount of [[metabase.warehouse-schema-rest.api.field]]."
  (:require
   [metabase.data-apps.guard :as guard]
   [metabase.data-apps.rules :as rules]))

(set! *warn-on-reflection* true)

(defn- check-field!
  "Checks the field whose ID is the `:id` route param."
  [_request {:keys [id]}]
  (rules/check-field! id))

(defn- check-field-values!
  "Checks the values of the field whose ID is the `:id` route param, and of the one whose ID is the `other-id-key`
  route param when given."
  [& [other-id-key]]
  (fn [_request route-params]
    (rules/check-field-values! (:id route-params))
    (when other-id-key
      (rules/check-field-values! (get route-params other-id-key)))))

(defn- check-field-metadata!
  "Checks the field whose metadata a `request` asks for, returning the filter of that metadata."
  [request route-params]
  (check-field! request route-params)
  (fn [field]
    (first (:fields (rules/filter-table-metadata {:fields [field]})))))

(defn- check-field-related!
  "Checks the field whose related entities a `request` asks for, returning the filter of them."
  [request route-params]
  (check-field! request route-params)
  rules/filter-related)

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.warehouse-schema-rest.api.field]]."
  {[:get "/:id"]                        check-field-metadata!
   [:get "/:id/summary"]                check-field!
   [:get "/:id/values"]                 (check-field-values!)
   [:get "/:id/search/:search-id"]      (check-field-values! :search-id)
   [:get "/:id/remapping/:remapped-id"] (check-field-values! :remapped-id)
   [:get "/:id/related"]                check-field-related!})

(def field-guard
  "Ring middleware guarding the data-app requests to the `/api/field` mount."
  (guard/route-guard 'metabase.warehouse-schema-rest.api.field checks))
