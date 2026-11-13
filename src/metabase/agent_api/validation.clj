(ns metabase.agent-api.validation
  (:require
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.api.routes.common :as routes.common]
   [metabase.llm.settings :as llm.settings]
   [metabase.util.i18n :refer [tru]]))

(defn enforce-agent-api-enabled
  "Ring middleware that blocks external Agent API requests unless AI features are on and an admin opted in to the
  deprecated Agent API with [[agent-api.settings/deprecated-agent-api-enabled?]]."
  [handler]
  (fn [request respond raise]
    (cond
      (not (llm.settings/ai-features-enabled?))
      (raise (ex-info (tru "AI features are not enabled.") {:status-code 403}))

      (agent-api.settings/deprecated-agent-api-enabled?)
      (handler request respond raise)

      :else
      (raise (ex-info (tru "The Agent API is deprecated and off by default. An admin can turn it on in Admin > AI > MCP.")
                      {:status-code 403})))))

(def ^{:arglists '([handler])} +agent-api-enabled
  "Wrap routes so they may only be accessed when the Agent API is enabled."
  (routes.common/wrap-middleware-for-open-api-spec-generation enforce-agent-api-enabled))
