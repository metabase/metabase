(ns metabase-enterprise.representations.api
  (:require
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.ingestion.core :as ingest]
   [metabase-enterprise.representations.schema.card.v0 :as schema]
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
      (ingest/validate-representation rep)
      (ingest/ingest-representation (assoc rep :collection collection-id))
      nil)
    (catch Throwable e
      (log/error e)
      (throw e))))

(api.macros/defendpoint :get "/question/:question-id"
  "Download a yaml representation of a question."
  [{:keys [question-id]}
   _query-params
   _body-params
   _request]
  (try
    (let [question-id (Long/parseLong question-id)
          question (api/check-404 (t2/select-one :model/Card :id question-id :type "question"))
          rep (rep/export-question question)]
      (ingest/validate-representation rep)
      (yaml/generate-string rep))
    (catch Throwable e
      (log/error e)
      (throw e))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/representations` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
