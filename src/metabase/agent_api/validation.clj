(ns metabase.agent-api.validation
  (:require
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.api.common :as api]
   [metabase.api.routes.common :as routes.common]
   [metabase.llm.settings :as llm.settings]
   [metabase.util.i18n :refer [tru]]))

(defn check-agent-api-enabled
  "Check that the Agent API is enabled, or throw a 403."
  []
  (api/check (llm.settings/ai-features-enabled?)
             [403 (tru "AI features are not enabled.")])
  (api/check (agent-api.settings/agent-api-enabled?)
             [403 (tru "Agent API is not enabled.")]))

(defn enforce-agent-api-enabled
  "Ring middleware that blocks external Agent API requests when the feature is disabled."
  [handler]
  (fn [request respond raise]
    (cond
      (not (llm.settings/ai-features-enabled?))
      (raise (ex-info (tru "AI features are not enabled.") {:status-code 403}))

      (agent-api.settings/agent-api-enabled?)
      (handler request respond raise)

      :else
      (raise (ex-info (tru "Agent API is not enabled.") {:status-code 403})))))

(def ^{:arglists '([handler])} +agent-api-enabled
  "Wrap routes so they may only be accessed when the Agent API is enabled."
  (routes.common/wrap-middleware-for-open-api-spec-generation enforce-agent-api-enabled))
