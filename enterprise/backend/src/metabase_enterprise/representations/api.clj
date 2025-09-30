(ns metabase-enterprise.representations.api
  (:require
   [clojure.pprint :refer [pprint]]
   [metabase-enterprise.representations.core :as rep]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.collections.api :as coll.api]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private yaml-options {:flow-style            :block
                             :indent                2
                             :indicator-indent      2
                             :indent-with-indicator true})

(api.macros/defendpoint :post "/load/:collection-id"
  "Create a new thingy inside of a collection."
  [{:keys [collection-id]}
   _query-params
   _body-params
   request]
  (try
    (let [collection-id (Long/parseLong collection-id)]
      (-> (slurp (:body request))
          yaml/parse-string
          (assoc :collection collection-id)
          rep/validate
          rep/persist!)
      nil)
    (catch Throwable e
      (log/error e)
      (throw e))))

(api.macros/defendpoint :get "/question/:id"
  "Download a yaml representation of a question."
  [{:keys [id]} :- :any
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        question (api/check-404 (t2/select-one :model/Card :id id :type "question"))
        rep (rep/export question)]
    (try
      (rep/validate rep)
      (catch Exception e
        (log/error e "Does not validate.")))
    (yaml/generate-string rep yaml-options)))

(api.macros/defendpoint :get "/model/:id"
  "Download a yaml representation of a model."
  [{:keys [id]}
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        question (api/check-404 (t2/select-one :model/Card :id id :type "model"))
        rep (rep/export question)]
    (try
      (rep/validate rep)
      (catch Exception e
        (log/error e "Does not validate.")))
    (yaml/generate-string rep yaml-options)))

(api.macros/defendpoint :get "/metric/:id"
  "Download a yaml representation of a model."
  [{:keys [id]}
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        question (api/check-404 (t2/select-one :model/Card :id id :type "metric"))
        rep (rep/export question)]
    (try
      (-> rep
          rep/validate
          yaml/generate-string)
      (catch Exception e
        (log/error e "Does not validate.")
        (yaml/generate-string rep yaml-options)))))

(api.macros/defendpoint :get "/transform/:id"
  "Download a yaml representation of a model."
  [{:keys [id]}
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        question (api/check-404 (t2/select-one :model/Transform :id id))
        rep (rep/export question)]
    (try
      (-> rep
          rep/validate
          yaml/generate-string)
      (catch Exception e
        (log/error e "Does not validate.")
        (yaml/generate-string rep yaml-options)))))

(comment
  (def m (t2/select-one :model/Transform))

  (clojure.pprint/pprint m))

(api.macros/defendpoint :get "/collection/:id"
  "Download a yaml representation of a collection."
  [{:keys [id]}
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        collection (api/check-404 (t2/select-one :model/Collection :id id))
        rep (rep/export collection)]
    (try
      (rep/validate rep)
      (catch Exception e
        (log/error e "Does not validate.")))
    (yaml/generate-string rep yaml-options)))

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
      (rep/validate rep)
      (catch Exception e
        (log/error e "Does not validate.")))
    (yaml/generate-string rep yaml-options)))

(comment
  (binding [api/*current-user-id* 1]
    (coll.api/collection-children (t2/select-one :model/Collection :id 5)
                                  {:show-dashboard-questions? true
                                   :archived? false})))

(api.macros/defendpoint :post "/validate"
  "Validate a YAML representation string and return validation errors if any.
   Returns an empty string if validation succeeds, or the ex-data as a string if it fails."
  [_path-params
   _query-params
   _body-params
   request]
  (try
    (let [yaml-string (slurp (:body request))
          representation (yaml/parse-string yaml-string)]
      (rep/validate representation)
      "")                               ; Return empty string on success
    (catch Exception e
      (with-out-str
        (println (ex-message e))
        (pprint (ex-data e))))))

(api.macros/defendpoint :post "/collection/:collection-id/export"
  "Export all representations in a collection to the local filesystem"
  [{:keys [collection-id]} :- :any
   _query-params
   _body-params
   _request]
  (rep/export-collection-representations (Long/parseLong collection-id))
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
  (rep/export-transform-representations)
  "Ok")

(api.macros/defendpoint :post "/transform/import"
  "Import all transform representations from the local filesystemto Metabase"
  [_path-params
   _query-params
   _body-params
   _request]
  (rep/import-transform-representations)
  "Ok")

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/representations` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
