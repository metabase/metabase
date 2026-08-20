(ns metabase.typed-schemas-rest.api
  "/api/typed-schemas endpoints.

  This is the only place REST-shaped strings exist: query parameters decode to
  typed options in [[metabase.typed-schemas-rest.api.query-params]] at this
  boundary, and everything in `metabase.typed-schemas.*` works on typed data."
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
   [:database {:optional true}
    [:maybe {:description "Scopes the schema to a database by numeric id or name."}
     ms/NonBlankString]]
   [:library-collections {:optional true}
    [:maybe {:description (str "Comma-separated library collection ids or entity ids. "
                               "Limits tables and metrics to those library collections.")}
     ms/NonBlankString]]
   [:include-data-library {:optional true}
    [:maybe {:description "Whether to include the entire data library."}
     :boolean]]
   [:include-metric-library {:optional true}
    [:maybe {:description "Whether to include the entire metric library."}
     :boolean]]
   [:include-models {:optional true}
    [:maybe {:description (str "Whether to include all readable models with executable actions. "
                               "Database scope applies when provided.")}
     :boolean]]])

(api.macros/defendpoint :get "/v1/typescript" :- :any
  "Generate a TypeScript semantic schema module."
  [_route-params
   query-params :- TypedSchemaQueryParams
   _body-params
   {{question-collections "question-collections"} :query-params}]
  (when (some? question-collections)
    (throw (ex-info "The question-collections query parameter is not supported."
                    {:status-code 400})))
  {:status  200
   :headers typescript-response-headers
   :body    (-> query-params
                query-params/query-params->options
                typed-schemas/build-semantic-schema
                typed-schemas/render-typescript)})
