(ns metabase.typed-schemas.api
  "/api/typed-schemas endpoints."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.typed-schemas.api.render :as render]
   [metabase.typed-schemas.api.schema :as schema]))

(set! *warn-on-reflection* true)

(def ^:private javascript-response-headers
  {"Content-Type"                 "text/javascript; charset=utf-8"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-store"})

(def ^:private typescript-response-headers
  (assoc javascript-response-headers "Content-Type" "text/typescript; charset=utf-8"))

(api.macros/defendpoint :get "/v1/javascript" :- :any
  "Generate a JavaScript semantic schema module."
  [_route-params query-params _body _request respond _raise]
  (respond {:status  200
            :headers javascript-response-headers
            :body    (render/render-javascript (schema/typed-schema query-params))}))

(api.macros/defendpoint :get "/v1/typescript" :- :any
  "Generate a TypeScript semantic schema module."
  [_route-params query-params _body _request respond _raise]
  (respond {:status  200
            :headers typescript-response-headers
            :body    (render/render-typescript (schema/typed-schema query-params))}))

(api.macros/defendpoint :get "/v1/json" :- :any
  "Generate a JSON semantic schema."
  [_route-params query-params]
  (schema/typed-schema query-params))

(def ^{:arglists '([request respond raise])} routes
  "`/api/typed-schemas/` routes."
  (api.macros/ns-handler *ns*))
