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

(defn- check-body-query-metadata!
  "Checks the query whose metadata a `request` asks for, returning the filter of that metadata."
  [request route-params]
  (check-body-query! request route-params)
  rules/filter-query-metadata)

(defn- check-parameter!
  "Checks the parameter, and the fields, whose values a `request` asks for."
  [request _route-params]
  (let [{:keys [parameter field_ids]} (api.macros/request-body request)]
    (rules/check-parameter! parameter field_ids)))

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.query-processor.api]]."
  {[:post "/"]                        check-body-query!
   [:post "/:export-format"]          check-export-query!
   [:post "/query_metadata"]          check-body-query-metadata!
   [:post "/native"]                  check-native-body-query!
   [:post "/pivot"]                   check-body-query!
   [:post "/parameter/values"]        check-parameter!
   [:post "/parameter/search/:query"] check-parameter!
   [:post "/parameter/remapping"]     check-parameter!})

(def dataset-guard
  "Ring middleware guarding the data-app requests to the `/api/dataset` mount."
  (guard/route-guard 'metabase.query-processor.api checks))
