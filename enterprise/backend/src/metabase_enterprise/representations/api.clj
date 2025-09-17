(ns metabase-enterprise.representations.api
  (:require
   [metabase-enterprise.representations.ingestion.core :as ingest]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/load/:collection-id"
  "Create a new thingy inside of a collection."
  [{:keys [collection-id]}
   _query-params
   body-params
   request]
  (try
    (let [collection-id (Long/parseLong collection-id)
          rep (yaml/parse-string
               (slurp (:body request)))
          rep (ingest/validate-representation rep)]
      (ingest/ingest-representation (assoc rep :collection collection-id))
      nil)
    (catch clojure.lang.ExceptionInfo e
      (prn (ex-data e)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/representations` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
