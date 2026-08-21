(ns metabase.mcp.validation
  (:require
   [metabase.api.routes.common :as routes.common]
   [metabase.llm.settings :as llm.settings]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.util.i18n :refer [tru]]))

(defn enforce-mcp-enabled
  "Ring middleware that blocks external MCP requests when the feature is disabled. Gates the MCP
   surface itself and the iframe callbacks under `/api/embed-mcp` that serve it."
  [handler]
  (fn [request respond raise]
    (cond
      (not (llm.settings/ai-features-enabled?))
      (raise (ex-info (tru "AI features are not enabled.") {:status-code 403}))

      (mcp.settings/mcp-enabled?)
      (handler request respond raise)

      :else
      (raise (ex-info (tru "MCP server is not enabled.") {:status-code 403})))))

(def ^{:arglists '([handler])} +mcp-enabled
  "Wrap routes so they may only be accessed when the MCP server is enabled."
  (routes.common/wrap-middleware-for-open-api-spec-generation enforce-mcp-enabled))

(defn api-key-authenticated?
  "True when [[metabase.server.middleware.session]] authenticated `request` with an `X-Api-Key`.

   MCP is per-user OAuth only. An API key authenticates as a `:type :api-key` user, which the seat
   count (`:type \"personal\"`) excludes entirely, and it carries no `:token-scopes`, so it would
   reach the surface as one unbilled, unconsented credential holding every tool."
  [request]
  (= "api-key" (:embedding/auth-method request)))

(defn enforce-not-api-key-authenticated
  "Ring middleware refusing API-key-authenticated requests with a 401, steering the caller to OAuth."
  [handler]
  (fn [request respond raise]
    (if (api-key-authenticated? request)
      (raise (ex-info (tru "This endpoint requires per-user OAuth authentication and does not accept API keys.")
                      {:status-code 401}))
      (handler request respond raise))))

(def ^{:arglists '([handler])} +no-api-key-auth
  "Wrap routes so an API key never authenticates them, however the rest of the API treats one."
  (routes.common/wrap-middleware-for-open-api-spec-generation enforce-not-api-key-authenticated))
