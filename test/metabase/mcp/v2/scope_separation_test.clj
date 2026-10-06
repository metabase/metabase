(ns metabase.mcp.v2.scope-separation-test
  "Invariants that keep the scopes an MCP OAuth token carries apart from the scopes REST endpoints declare. An MCP
  OAuth token must never satisfy a `defendpoint`: MCP scopes gate tools and resources, and REST (CLI) scopes gate
  endpoints."
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.scope :as scope]
   [metabase.config.core :as config]
   [metabase.mcp.paths :as mcp.paths]
   ;; Loaded for its load-time side effects: it requires every v2 tool namespace, which registers the tools.
   [metabase.mcp.v2.api]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resources :as v2.resources]
   [metabase.oauth-server.core :as oauth-server]))

(set! *warn-on-reflection* true)

(defn- load-all-api-namespaces!
  "Load the OSS route table and, when it is available, the EE one. They require every namespace that declares
  endpoints."
  []
  (require 'metabase.api-routes.routes)
  (when config/ee-available?
    (require 'metabase-enterprise.api-routes.routes)))

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
      (when config/ee-available?
        (is (seq (filter #(:api/endpoints (meta %))
                         (filter #(.startsWith (name (ns-name %)) "metabase-enterprise.") (all-ns))))
            "at least one EE namespace with endpoints must be loaded")))))

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

(def ^:private unchecked-allowlist
  "Endpoints allowed to declare `:scope :unchecked`, as `[namespace method path]`."
  #{['metabase.agent-api.api :get "/v1/ping"]})

(defn- endpoint-scope-kind
  "How an endpoint takes part in scope enforcement: `:declared` for a string `:scope`, `:ensure-scopes-checked` for
  no `:scope`, `:unchecked` for `:scope :unchecked`, or `:other`. Reads the middleware that `defendpoint` builds."
  [nmspace endpoint]
  (let [middleware (#'api.macros/middleware-forms (:form endpoint))]
    (cond
      (declared-scope nmspace endpoint)
      (if (some #(and (seq? %) (= 'metabase.api.macros.scope/enforce-scope (first %))) middleware)
        :declared
        :other)

      (some #{'metabase.api.macros.scope/ensure-scopes-checked} middleware)
      :ensure-scopes-checked

      (= :unchecked (get-in endpoint [:form :metadata :scope]))
      :unchecked

      :else
      :other)))

(defn- endpoints-by-scope-kind
  "Map of [[endpoint-scope-kind]] to the set of `[namespace method path]` routes of that kind, over every loaded
  endpoint."
  []
  (reduce (fn [acc nmspace]
            (reduce (fn [acc [_k endpoint]]
                      (update acc (endpoint-scope-kind nmspace endpoint) (fnil conj #{})
                              [(ns-name nmspace)
                               (get-in endpoint [:form :method])
                               (get-in endpoint [:form :route :path])]))
                    acc
                    (api.macros/ns-routes nmspace)))
          {}
          (filter #(:api/endpoints (meta %)) (all-ns))))

(defn- ring-status
  "The status `handler`, an async Ring handler, responds with for `request`."
  [handler request]
  (let [p (promise)]
    (handler request #(deliver p (:status %)) #(deliver p %))
    (deref p 10000 ::timeout)))

(deftest every-endpoint-opts-in-to-a-scope-or-is-scope-checked-test
  (load-all-api-namespaces!)
  (testing "Every `defendpoint` in every OSS and EE API namespace either declares a string `:scope`, or declares
            none and so is wrapped in `ensure-scopes-checked`, or is an allowlisted `:scope :unchecked` endpoint.
            This makes `mcp-scoped-token-is-refused-by-unscoped-endpoints-test` exhaustive: an MCP-scoped token can
            reach only an endpoint that opts in with a scope, and no endpoint opts in with an MCP scope."
    (let [by-kind (endpoints-by-scope-kind)]
      (testing "the walk sees endpoints of each enforced kind"
        (is (seq (:declared by-kind)))
        (is (< 100 (count (:ensure-scopes-checked by-kind)))))
      (testing "no endpoint falls outside the three kinds"
        (is (= nil (:other by-kind))))
      (testing "every `:scope :unchecked` endpoint is on the allowlist. Such an endpoint serves any token, MCP-scoped
                ones included."
        (is (= #{} (set/difference (:unchecked by-kind #{}) unchecked-allowlist))))))
  (testing "`ensure-scopes-checked` refuses an OAuth request whose token holds only the MCP v2 scopes"
    (let [handler (scope/ensure-scopes-checked (fn [_request respond _raise] (respond {:status 200})))]
      (is (= 403 (ring-status handler {:token-scopes             (set mcp.paths/v2-surface-scopes)
                                       :authenticated-via-oauth? true}))))))
