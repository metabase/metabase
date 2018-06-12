(ns metabase.api.graphql
  "/api/graphql endpoints"
  (:require [cheshire.core :as json]
            [clojure.tools.logging :as log]
            [com.walmartlabs.lacinia :as lacinia]
            [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.schema :as s]))

(api/defendpoint GET "/"
                 "GraphQL endpoint"
                 [query variables operationName]
                 (lacinia/execute (s/load-schema)
                                  query
                                  (if variables (json/parse-string variables))
                                  nil
                                  {:operation-name operationName}))

(api/defendpoint POST "/"
                 "GraphQL endpoint"
                 [:as {{:keys [query variables operationName]} :body}]
                 (lacinia/execute (s/load-schema)
                                  query
                                  variables
                                  nil
                                  {:operation-name operationName}))

(api/define-routes)
