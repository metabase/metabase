(ns metabase.mcp.v2.scope-separation-test
  "Invariants that keep the scopes an MCP OAuth token carries apart from the scopes REST endpoints declare. An MCP
  OAuth token must never satisfy a `defendpoint`: MCP scopes gate tools and resources, and REST (CLI) scopes gate
  endpoints."
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase.api.macros :as api.macros]
   [metabase.mcp.paths :as mcp.paths]
   ;; Loaded for its load-time side effects: it requires every v2 tool namespace, which registers the tools.
   [metabase.mcp.v2.api]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resources :as v2.resources]
   [metabase.oauth-server.core :as oauth-server]))

(set! *warn-on-reflection* true)

(defn- load-all-api-namespaces!
  "Load the OSS and EE route tables, which require every namespace that declares endpoints."
  []
  (require 'metabase.api-routes.routes
           'metabase-enterprise.api-routes.routes))

(defn- declared-scope
  "The `:scope` string a `defendpoint` in `nmspace` declares, or nil when it declares none or a keyword such as
  `:unchecked`. Metadata is stored unevaluated, so a symbol or expression is evaluated in `nmspace`."
  [nmspace endpoint]
  (let [form (get-in endpoint [:form :metadata :scope])
        v    (if (or (symbol? form) (seq? form))
               (binding [*ns* (the-ns nmspace)]
                 (eval form))
               form)]
    (when (string? v) v)))

(defn- endpoint-scope->routes
  "Map of each string `:scope` declared on any loaded `defendpoint` to the `[namespace method path]` routes that
  declare it."
  []
  (reduce (fn [acc nmspace]
            (reduce (fn [acc [_k endpoint]]
                      (if-let [scope (declared-scope nmspace endpoint)]
                        (update acc scope (fnil conj #{})
                                [(ns-name nmspace)
                                 (get-in endpoint [:form :method])
                                 (get-in endpoint [:form :route :path])])
                        acc))
                    acc
                    (api.macros/ns-routes nmspace)))
          {}
          (filter #(:api/endpoints (meta %)) (all-ns))))

(defn- endpoint-scopes
  "Every string scope a `defendpoint` declares, plus the full-access scope that satisfies every endpoint."
  []
  (conj (set (keys (endpoint-scope->routes))) oauth-server/full-access-scope))

(defn- tool-level-scopes
  "Every scope a registered v2 tool or v2 resource declares."
  []
  (set/union (set (registry/registered-scopes))
             (set (v2.resources/resource-scopes))))

(deftest endpoint-enumeration-is-complete-test
  (testing "the endpoint walk must reach OSS and EE API namespaces and the agent API, or the invariants below
            prove nothing"
    (load-all-api-namespaces!)
    (let [routes (endpoint-scope->routes)
          nss    (into #{} (comp cat (map first)) (vals routes))]
      (is (contains? nss 'metabase.agent-api.api))
      (is (seq (filter #(:api/endpoints (meta %))
                       (filter #(.startsWith (name (ns-name %)) "metabase-enterprise.") (all-ns))))
          "at least one EE namespace with endpoints must be loaded"))))

(deftest cli-oauth-and-mcp-oauth-use-different-scopes-test
  (load-all-api-namespaces!)
  (let [mcp-scopes (set mcp.paths/v2-surface-scopes)
        routes     (endpoint-scope->routes)]
    (testing "MCP scopes and endpoint scopes are disjoint. If an MCP scope were also an endpoint scope, an MCP OAuth
              token would satisfy that `defendpoint` and reach the REST API outside the MCP tool surface."
      (is (= #{} (set/intersection mcp-scopes (endpoint-scopes)))))
    (testing "From the endpoint side: no `defendpoint` declares an MCP scope. Each offending endpoint is listed so
              the fix is to give it a REST (CLI) scope instead."
      (is (= {} (select-keys routes mcp-scopes))))))

(deftest mcp-scopes-live-at-the-tool-level-test
  (let [mcp-scopes  (set mcp.paths/v2-surface-scopes)
        tool-scopes (tool-level-scopes)]
    (testing "every scope a v2 tool or resource declares is an MCP scope. A tool gated on any other scope is
              unreachable over MCP OAuth, because the OAuth server grants an MCP client only MCP scopes."
      (is (= #{} (set/difference tool-scopes mcp-scopes))))
    (testing "every MCP scope gates at least one v2 tool or resource. An MCP scope that gates no tool or resource
              grants nothing on the MCP surface; its only possible effect is on a `defendpoint`."
      (is (= #{} (set/difference mcp-scopes tool-scopes))))))
