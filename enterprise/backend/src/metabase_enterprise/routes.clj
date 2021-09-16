(ns metabase-enterprise.routes
  "API routes that are only available when running Metabase® Enterprise Edition™. Even tho these routes are available,
  not all routes might work unless we have a valid premium features token to enable those features."
  (:require [compojure.core :as compojure]
            [metabase-enterprise.content-management.api.routes :as content-management.routes]
            [metabase-enterprise.sandbox.api.routes :as sandbox.routes]
            [metabase.public-settings.premium-features :as premium-features]))

(defn- +require-premium-feature [pred feature-not-present-message handler]
  (fn [request respond raise]
    (when-not (pred)
      (throw (ex-info feature-not-present-message
                      {:status-code 401})))
    (handler request respond raise)
    (premium-features/enable-advanced-config?)))

(compojure/defroutes ^{:doc "API routes only available when running Metabase® Enterprise Edition™."} routes
  sandbox.routes/routes
  content-management.routes/routes)
