(ns metabase-enterprise.metabot-v3.agent-api.api
  "Customer-facing Agent API for headless BI applications.

  This namespace contains versioned API endpoints that wrap a subset of Metabot tools,
  intended for external consumption by customer applications building on Metabase's
  semantic layer.

  Endpoints are versioned (e.g., /v1/search) and use JWT authentication for secure,
  user-scoped access."
  (:require
   [metabase-enterprise.metabot-v3.tools.deftool :refer [deftool]]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.registry :as mr]))

;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(mr/def ::ping-result
  [:map
   [:structured_output
    [:map
     [:message :string]]]])

;;; --------------------------------------------------- Endpoints ----------------------------------------------------

(deftool "/ping"
  "Health check endpoint for the Agent API."
  {:version       1
   :result-schema ::ping-result
   :handler       (fn [_args] {:structured_output {:message "pong"}})})

;;; ---------------------------------------------------- Routes ------------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/agent/` routes. Versioned endpoints live under `/api/agent/v1/`, `/api/agent/v2/`, etc."
  (api.macros/ns-handler *ns* +auth))
