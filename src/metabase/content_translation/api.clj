(ns metabase.content-translation.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.premium-features.core :as premium-features]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/dictionary"
  "Provides translations of user-generated content. This is a public route so that logged-out viewers of static-embedded questions and dashboards can retrieve translations"
  ;; TODO: Secure this route against shenanigans
  [_route-params query-params _body]
  (if (premium-features/enable-content-translation?)
    (let [locale (:locale query-params)]
      (if locale
        {:data (t2/select :model/ContentTranslation :locale locale)}
        {:data (t2/select :model/ContentTranslation)}))
    (throw (ex-info "Content translation is not enabled" {:status-code 400}))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/content-translation-dictionary` routes"
  (api.macros/ns-handler *ns*))
