(ns metabase-enterprise.representations.api
  (:require
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.ingestion.core :as ingest]
   [metabase-enterprise.representations.schema.core :as schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/load/:collection-id"
  "Create a new thingy inside of a collection."
  [{:keys [collection-id]}
   _query-params
   _body-params
   request]
  (try
    (let [collection-id (Long/parseLong collection-id)
          rep (yaml/parse-string (slurp (:body request)))]
      (schema/validate rep)
      (ingest/ingest-representation (assoc rep :collection collection-id))
      nil)
    (catch Throwable e
      (log/error e)
      (throw e))))

(api.macros/defendpoint :get "/question/:id"
  "Download a yaml representation of a question."
  [{:keys [id]}
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        question (api/check-404 (t2/select-one :model/Card :id id :type "question"))
        rep (rep/export-card "question" question)]
    (try
      (schema/validate rep)
      (catch Exception e
        (log/error e "Does not validate.")))
    (yaml/generate-string rep)))

(api.macros/defendpoint :get "/model/:id"
  "Download a yaml representation of a model."
  [{:keys [id]}
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        question (api/check-404 (t2/select-one :model/Card :id id :type "model"))
        rep (rep/export-card "model" question)]
    (try
      (schema/validate rep)
      (catch Exception e
        (log/error e "Does not validate.")))
    (yaml/generate-string rep)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/representations` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
