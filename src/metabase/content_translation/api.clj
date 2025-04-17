(ns metabase.content-translation.api
  (:require
   [metabase-enterprise.content-translation.models :as ct]
   [metabase.api.macros :as api.macros]))

(api.macros/defendpoint :get "/dictionary"
  "Provides translations of user-generated content. This is a public route so that logged-out viewers of static-embedded questions and dashboards can retrieve translations"
  [_route-params query-params _body]
  (let [locale (:locale query-params)]
    (if locale
      {:data (ct/get-translations locale)}
      {:data (ct/get-translations)})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/content-translation-dictionary` routes"
  (api.macros/ns-handler *ns*))
