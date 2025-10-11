(ns metabase-enterprise.representations.api
  (:require
   [clojure.pprint :refer [pprint]]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.dependencies :as deps]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/database/:id"
  "Download a yaml representation of a database."
  [{:keys [id]}
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        database (api/check-404 (t2/select-one :model/Database :id id))
        rep (rep/export database)]
    (try
      (rep/normalize-representation rep)
      (catch Exception e
        (log/error e "Does not validate.")))
    (rep-yaml/generate-string rep)))

(api.macros/defendpoint :post "/validate"
  "Validate a YAML representation string and return validation errors if any.
   Returns an empty string if validation succeeds, or the ex-data as a string if it fails."
  [_path-params
   _query-params
   _body-params
   request]
  (try
    (let [yaml-string (slurp (:body request))
          representation (rep-yaml/parse-string yaml-string)]
      (rep/normalize-representation representation)
      "") ; Return empty string on success
    (catch Exception e
      (with-out-str
        (println (ex-message e))
        (pprint (ex-data e))))))

(api.macros/defendpoint :get "/collection/:collection-id"
  "Export all representations in a collection as a single yaml file"
  [{:keys [collection-id]} :- :any
   _
   _
   _]
  (let [collection-id (Long/parseLong collection-id)]
    (rep-yaml/generate-string (export/export-entire-collection collection-id))))

(api.macros/defendpoint :put "/collection/:collection-id"
  "Import into a collection. Will delete everything in the collection first."
  [{:keys [collection-id]} :- :any
   _
   _
   request]
  ;; TODO: remove everything from the collection, maybe put it into an archive collection
  (let [yaml-string (slurp (:body request))
        collection (rep-yaml/parse-string yaml-string)
        representations (import/collection-representations collection)
        representations (import/order-representations representations)
        representations (map import/normalize-representation representations)
        errors (deps/check-dependencies representations)]
    (rep-yaml/generate-string errors)))

(api.macros/defendpoint :post "/collection/validate"
  "Validate a collection. Will return empty yml map when it's nothing."
  [_ :- :any
   _
   _
   request]
  ;; TODO: remove everything from the collection, maybe put it into an archive collection
  (let [yaml-string (slurp (:body request))
        collection (rep-yaml/parse-string yaml-string)
        representations (import/collection-representations collection)
        representations (import/order-representations representations)
        representations (map import/normalize-representation representations)
        errors (deps/check-dependencies representations)]
    (rep-yaml/generate-string errors)))

(api.macros/defendpoint :post "/collection/:collection-id/export"
  "Export all representations in a collection to the local filesystem"
  [{:keys [collection-id]} :- :any
   _query-params
   _body-params
   _request]
  (export/export-collection-representations (Long/parseLong collection-id))
  "Ok")

(api.macros/defendpoint :post "/collection/:collection-id/import"
  "Import all representations from the local filesystem into a collection"
  [{:keys [collection-id]} :- :any
   _query-params
   _body-params
   _request]
  (rep/import-collection-representations (Long/parseLong collection-id))
  "Ok")

(api.macros/defendpoint :post "/transform/export"
  "Export all transform representations to the local filesystem"
  [_path-params
   _query-params
   _body-params
   _request]
  (export/export-transform-representations)
  "Ok")

(api.macros/defendpoint :post "/transform/import"
  "Import all transform representations from the local filesystemto Metabase"
  [_path-params
   _query-params
   _body-params
   _request]
  (import/import-transform-representations)
  "Ok")

(api.macros/defendpoint :post "/collection/import"
  "Import a collection from a YAML bundle in the request body. Creates a new collection based on the name in the bundle."
  [_path-params
   _query-params
   _body-params
   request]
  (let [yaml-string (slurp (:body request))
        result (import/import-collection-yaml yaml-string)]
    {:collection-id (:id result)
     :status "ok"}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/representations` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
