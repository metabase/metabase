(ns metabase.typed-schemas-rest.api
  "/api/typed-schemas endpoints."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.typed-schemas-rest.api.query-params :as query-params]
   [metabase.typed-schemas.core :as typed-schemas]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private typescript-response-headers
  {"Content-Type"                 "text/typescript; charset=utf-8"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-store"})

(def ^:private TypedSchemaQueryParams
  [:map
   [:database {:optional true} [:maybe ms/NonBlankString]]
   [:library-collections {:optional true} [:maybe ms/NonBlankString]]
   [:question-collections {:optional true} [:maybe ms/NonBlankString]]
   [:include-data-library {:optional true} [:maybe :boolean]]
   [:include-metric-library {:optional true} [:maybe :boolean]]
   [:include-models {:optional true} [:maybe :boolean]]])

(api.macros/defendpoint :get "/v1/typescript" :- :any
  "Generate a TypeScript semantic schema module."
  [_route-params
   query-params :- TypedSchemaQueryParams
   _body
   _request
   respond
   _raise]
  (respond {:status  200
            :headers typescript-response-headers
            :body    (-> query-params
                         query-params/query-params->options
                         typed-schemas/build-semantic-schema
                         typed-schemas/render-typescript)}))
