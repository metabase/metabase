(ns metabase-enterprise.workspaces.api-parity-test
  "Verifies that Agent API schemas stay in sync with their implementations.
   In general, the implementations will be shared with the regular EE APIs, so we can use their schemas as a baseline.
   For now there is no divergence, so we catch unintentional drift by comparing the response schemas of both routes."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.agent-api.workspace]
   [metabase-enterprise.workspaces.api]
   [metabase.api.macros :as api.macros]))

(set! *warn-on-reflection* true)

(def ^:private agent-only-endpoints
  "Agent API endpoints that intentionally have no EE equivalent.
   Add entries here when an agent endpoint is agent-specific by design."
  #{;; example: [:post "/:ws-id/agent-specific-action"]
    })

(def ^:private route-mapping
  "Explicit mapping from agent route to EE route for endpoints with different paths.
   Keys are [method agent-route], values are [method ee-route]."
  {;; example: [:get "/:ws-id/agent-path"] [:get "/:ws-id/ee-path"]
   })

(defn- endpoint-schemas
  "Returns a map of {[method route] -> response-schema} for a namespace."
  [ns-sym]
  (into {}
        (keep (fn [[[method route _params] info]]
                (when-let [schema (get-in info [:form :response-schema])]
                  [[method route] schema])))
        (api.macros/ns-routes ns-sym)))

(deftest response-schemas-in-sync-test
  (let [agent-schemas (endpoint-schemas 'metabase-enterprise.agent-api.workspace)
        ee-schemas    (endpoint-schemas 'metabase-enterprise.workspaces.api)]
    ;; In the future, we may want to diverge in certain ways. Let's tackle that when we get there, but it will probably
    ;; involve skipping those routes, or defining precisely how we expect them to differ (e.g. wrapping)
    (testing "Every agent API endpoint should have a matching EE endpoint with the same response schema"
      (is (seq agent-schemas) "Agent API should have endpoints")
      (doseq [[[method route :as agent-key] agent-schema] (sort-by key agent-schemas)
              :when (not (agent-only-endpoints agent-key))]
        (let [ee-key    (get route-mapping agent-key agent-key)
              ee-schema (ee-schemas ee-key)]
          (testing (str (name method) " " route)
            (if ee-schema
              (is (= ee-schema agent-schema))
              (is false
                  (str "No matching EE endpoint for agent route " agent-key ". "
                       "Update `route-mapping` to map it to the correct EE route, "
                       "or add it to `agent-only-endpoints` if there is no equivalent.")))))))))
