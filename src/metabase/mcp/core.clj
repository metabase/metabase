(ns metabase.mcp.core
  "Public API surface for the MCP module."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.mcp.resources :as mcp.resources]))

(set! *warn-on-reflection* true)

(defn all-scopes
  "All supported OAuth scopes: those declared on agent-api endpoints via
   defendpoint metadata, plus scopes from MCP UI resources (e.g. visualize_query)."
  []
  (into (mcp.resources/all-scopes)
        (comp (keep #(get-in % [:form :metadata :scope]))
              (filter string?))
        (vals (api.macros/ns-routes 'metabase.agent-api.api))))
