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
