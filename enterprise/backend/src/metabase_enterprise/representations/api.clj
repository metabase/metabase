(ns metabase-enterprise.representations.api
  (:require
   [metabase-enterprise.representations.common :as common]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.dependencies :as deps]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.init]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [representations.core :as rep-core]
   [representations.read :as rep-read]
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
      (log/error e "Validation failed")
      (str (ex-message e) "\n" (json/encode (ex-data e))))))

(api.macros/defendpoint :get "/collection/:collection-id"
  "Export all representations in a collection as a single yaml file"
  [{:keys [collection-id]}
   _
   _
   _]
  (let [collection-id (Long/parseLong collection-id)]
    (rep-yaml/generate-string (export/export-entire-collection collection-id))))

(api.macros/defendpoint :put "/collection/:collection-id"
  "Import into a collection. Will delete everything in the collection first."
  [_path-params
   _
   _
   request]
  ;; TODO: remove everything from the collection, maybe put it into an archive collection
  (let [yaml-string (slurp (:body request))
        collection (rep-yaml/parse-string yaml-string)
        representations (import/collection-representations collection)
        representations (v0-common/order-representations representations)
        representations (map rep-read/parse representations)
        errors (deps/check-dependencies representations)]
    (rep-yaml/generate-string errors)))

(api.macros/defendpoint :post "/collection/validate"
  "Validate a collection. Will return empty yml map when it's nothing."
  [_path-params
   _
   _
   request]
  ;; TODO: remove everything from the collection, maybe put it into an archive collection
  (let [yaml-string (slurp (:body request))
        collection (rep-yaml/parse-string yaml-string)
        representations (import/collection-representations collection)
        representations (v0-common/order-representations representations)
        representations (map rep-read/parse representations)
        errors (deps/check-dependencies representations)]
    (rep-yaml/generate-string errors)))

(api.macros/defendpoint :post "/collection/:collection-id/export"
  "Export all representations in a collection to the local filesystem"
  [{:keys [collection-id]}
   _query-params
   _body-params
   _request]
  (export/export-collection-representations (Long/parseLong collection-id))
  "Ok")

(api.macros/defendpoint :post "/collection/:collection-id/import"
  "Import all representations from the local filesystem into a collection"
  [{:keys [collection-id]}
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

(defn- reduce-tables [export-set]
  (cond-> export-set
    (> (count export-set) 1)
    (export/reduce-tables)))

(api.macros/defendpoint :get "/export-set/:type/:id"
  "Export an entity and its transitive dependencies as a JSON of YAMLs.
   Type can be: question, model, metric, transform, collection, database, snippet, timeline."
  [{:keys [type id]}
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        type-keyword (keyword type)
        model (common/toucan-model {:version rep-core/latest-version
                                    :type type-keyword})
        entity (api/check-404 (t2/select-one model :id id))
        representation (export/export-entity entity)
        export-set (-> [representation]
                       (export/export-set)
                       (reduce-tables)
                       (v0-common/order-representations)
                       (reverse)
                       (export/rename-refs export/ref-from-name export/standard-ref-strategies export/add-sequence-number))
        export-set (mapv #(dissoc % :entity_id :entity-id) export-set)
        clean-yamls (mapv v0-common/cleanup-delete-before-output export-set)
        export-yamls (mapv rep-yaml/generate-string clean-yamls)]
    (json/encode {:yamls export-yamls})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/representations` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
