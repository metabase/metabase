(ns metabase.data-apps.guards.dataset
  "The data-app guard of the `/api/dataset` mount of [[metabase.query-processor.api]]."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.data-apps.guard :as guard]
   [metabase.data-apps.rules :as rules]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- check-body-query!
  "Checks the query that is the body of `request`."
  [request _route-params]
  (rules/check-query! (api.macros/request-body request)))

(defn- check-native-body-query!
  "Checks the query that is the body of a `POST /api/dataset/native` `request`, without its `:pretty` flag."
  [request _route-params]
  (rules/check-query! (dissoc (api.macros/request-body request) :pretty)))

(defn- check-export-query!
  "Checks the `:query` of an export `request`, which a form submission sends as a JSON string."
  [request _route-params]
  (let [query (:query (api.macros/request-body request))]
    (rules/check-query! (cond-> query (string? query) json/decode+kw))))

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.query-processor.api]]."
  {[:post "/"]                        check-body-query!
   [:post "/:export-format"]          check-export-query!
   [:post "/query_metadata"]          check-body-query!
   [:post "/native"]                  check-native-body-query!
   [:post "/pivot"]                   check-body-query!
   [:post "/parameter/values"]        guard/refuse
   [:post "/parameter/search/:query"] guard/refuse
   [:post "/parameter/remapping"]     guard/refuse})

(def dataset-guard
  "Ring middleware guarding the data-app requests to the `/api/dataset` mount."
  (guard/route-guard 'metabase.query-processor.api checks))
