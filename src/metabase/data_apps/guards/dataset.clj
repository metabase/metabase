(ns metabase.data-apps.guards.dataset
  "The data-app guard of the `/api/dataset` mount of [[metabase.query-processor.api]]."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.data-apps.guards :as guards]
   [metabase.data-apps.guards.util :as guards.util]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- check-body-query!
  "Checks the query that is the body of `request`."
  [request _route-params]
  (guards/check-query! request (api.macros/request-body request)))

(defn- check-export-query!
  "Checks the `:query` of an export `request`, which a form submission sends as a JSON string."
  [request _route-params]
  (let [query (:query (api.macros/request-body request))]
    (guards/check-query! request (cond-> query (string? query) json/decode+kw))))

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.query-processor.api]]."
  {[:post "/"]               check-body-query!
   [:post "/query_metadata"] check-body-query!
   [:post "/pivot"]          check-body-query!
   [:post "/:export-format"] check-export-query!})

(def dataset-guard
  "Ring middleware guarding the data-app requests to the `/api/dataset` mount."
  (guards.util/route-guard 'metabase.query-processor.api checks))
