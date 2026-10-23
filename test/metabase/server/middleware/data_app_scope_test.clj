(ns metabase.server.middleware.data-app-scope-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-routes.routes]
   [metabase.api-scope.core :as api-scope]
   [metabase.api-scope.data-app :as api-scope.data-app]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.scope :as scope]
   [metabase.server.middleware.data-app-scope :as mw.data-app-scope]
   [metabase.test :as mt]))

(def ^:private marker
  {:headers {"x-metabase-client" "data-app"}})

(defn- run-middleware
  "Run `wrap-data-app-scope` over `request` and return the request its inner handler saw."
  [request]
  (let [seen    (promise)
        handler (mw.data-app-scope/wrap-data-app-scope
                 (fn [req respond _raise] (respond req)))]
    ;; A Clojure promise implements IFn via `deliver`, so it works directly as the `respond` callback.
    (handler request seen identity)
    (deref seen 1000 ::timeout)))

(defn- token-scopes-seen
  "The `:token-scopes` `wrap-data-app-scope`'s inner handler saw for `request`."
  [request]
  (:token-scopes (run-middleware request)))

(deftest ^:parallel wrap-data-app-scope-test
  (testing "an X-Metabase-Client: data-app request from a normal session narrows to the data-app scope"
    (is (= #{api-scope.data-app/data-app} (token-scopes-seen marker))))
  (testing "it narrows a full-access (::unrestricted) token down to the data-app scope"
    (is (= #{api-scope.data-app/data-app}
           (token-scopes-seen (assoc marker :token-scopes #{::scope/unrestricted})))))
  (testing "it narrows a `*` grant too — `scope-matches?` treats it as satisfying every scope"
    (is (= #{api-scope.data-app/data-app}
           (token-scopes-seen (assoc marker :token-scopes api-scope/unrestricted)))))
  (testing "a dev/preview data app is confined too — the X-Metabase-Client header is still \"data-app\"
            (the \"-preview\" suffix lives only on the analytics *client* var, not the header)"
    (is (= #{api-scope.data-app/data-app}
           (token-scopes-seen {:headers {"x-metabase-client"           "data-app"
                                         "x-metabase-embedded-preview" "true"}}))))
  (testing "a narrowed request is flagged, so downstream auth middleware can refuse to widen it"
    (is (true? (:data-app-scoped? (run-middleware marker)))))
  (testing "every request this middleware does not narrow reaches the handler byte-for-byte unchanged"
    (doseq [[what request] {"no client header at all"    {:headers {}}
                            "a non-data-app SDK client"  {:headers {"x-metabase-client" "embedding-sdk-react"}}
                            ;; Narrowing an already-scoped OAuth/agent token would broaden it.
                            "a marked but scoped token"  (assoc marker :token-scopes #{"agent:search"})
                            ;; An MCP-UI credential's route allowlist, not its scope set, confines it.
                            "a marked MCP-UI credential" (assoc marker
                                                                :token-scopes      #{::scope/unrestricted}
                                                                :mcp-ui-credential {:uid 1})}]
      (is (identical? request (run-middleware request)) what))))

(deftest ^:parallel data-app-scope-registered-test
  (testing "the data-app scope is registered so tagged endpoints don't warn about an unknown scope"
    (is (api-scope/registered-scope? api-scope.data-app/data-app)))
  (testing "the scope string is a wire contract — a JWT may carry it, so renaming is breaking"
    (is (= "data-apps:base" api-scope.data-app/data-app)))
  (testing "the `data-apps:*` wildcard covers it, leaving room for a later tier"
    (is (api-scope/scope-matches? #{"data-apps:*"} api-scope.data-app/data-app))))

(deftest data-app-marker-enforces-endpoint-scope-test
  ;; Mirrors the endpoints probed by the e2e spec
  ;; (e2e/test/scenarios/data-apps/sandboxing_isolation.cy.spec.ts) so both layers stay in sync.
  (let [as-data-app {:request-options {:headers {"x-metabase-client" "data-app"}}}
        privileged  ["permissions/graph" "setting"]]
    (testing "an admin session reaches the privileged endpoints without the data-app client header"
      (doseq [endpoint privileged]
        (is (mt/user-http-request :crowberto :get 200 endpoint) endpoint)))
    (testing "the write/admin endpoints still fail closed once the request is marked as a data app"
      (doseq [endpoint privileged]
        (is (= "scope_not_permitted"
               (:error (mt/user-http-request :crowberto :get 403 endpoint as-data-app)))
            endpoint)))
    (testing "the SDK bootstrap surface (current user + settings) is reachable when marked"
      (is (mt/user-http-request :crowberto :get 200 "user/current" as-data-app))
      (is (mt/user-http-request :crowberto :get 200 "session/properties" as-data-app)))
    (testing "the feature-surface reads (downloads pref) are reachable when marked"
      ;; POST /api/action/:id/execute (write-back for `useAction`) is tagged too, but needs an
      ;; action fixture — actions.cy.spec.ts is its functional guard under enforcement.
      ;;
      ;; 204 (not scope_not_permitted) proves the marked request reached the handler; the key is unset.
      (is (nil? (mt/user-http-request :crowberto :get 204
                                      "user-key-value/namespace/data-app-test/key/format" as-data-app))))
    (testing "alerts and subscriptions are not part of the data-app surface"
      ;; Scheduled email delivered out of band is not something a data app renders, so neither
      ;; the probe the SDK buttons gate on nor the CRUD behind them is reachable. The buttons are
      ;; gated off in a data app too (`embedding-sdk-ee/notifications`), so nothing offers a
      ;; control that would 403 here.
      (doseq [endpoint ["pulse/form_input" "pulse" "notification"]]
        (is (= "scope_not_permitted"
               (:error (mt/user-http-request :crowberto :get 403 endpoint as-data-app)))
            endpoint)))
    (testing "a pre-built-def route (field-routes, mounted by value not ns-symbol) enforces the tag"
      (is (mt/user-http-request :crowberto :get 200 (format "field/%d" (mt/id :venues :name)) as-data-app)))))

(deftest data-app-marker-refuses-denied-routes-test
  (let [as-data-app {:request-options {:headers {"x-metabase-client" "data-app"}}}]
    (testing "dashboards, native queries, parameters, model actions, table metadata and data browsing fail closed when marked"
      (doseq [[method endpoint] [[:get "dashboard/1"]
                                 [:get "card/1/params/x/values"]
                                 [:post "dataset/native"]
                                 [:post "dataset/parameter/values"]
                                 [:get "native-query-snippet"]
                                 [:get "timeline"]
                                 [:get "collection"]
                                 [:get "collection/1"]
                                 [:get "action"]
                                 [:get "action/1"]
                                 [:get (format "database/%d/schemas" (mt/id))]
                                 [:get (format "table/%d/fks" (mt/id :venues))]
                                 [:get (format "field/%d/summary" (mt/id :venues :name))]
                                 [:get "search"]
                                 [:get "collection/tree"]
                                 [:get (format "table/%d/query_metadata" (mt/id :venues))]
                                 [:delete "user-key-value/namespace/data-app-test/key/format"]]]
        (is (= "scope_not_permitted"
               (:error (mt/user-http-request :crowberto method 403 endpoint as-data-app)))
            endpoint)))))

(def ^:private data-app-endpoints
  "API namespace => the endpoints that the SDK's hooks and `StaticQuestion` call inside a data app."
  {'metabase.users-rest.api                   #{[:get "/current"]}
   'metabase.session.api                      #{[:get "/properties"]}
   'metabase.query-processor.api              #{[:post "/"] [:post "/query_metadata"] [:post "/pivot"]
                                                [:post "/:export-format"]}
   'metabase.queries-rest.api.card            #{[:get "/:id"] [:get "/:id/query_metadata"] [:post "/:card-id/query"]
                                                [:post "/:card-id/query/:export-format"] [:post "/pivot/:card-id/query"]}
   'metabase.warehouse-schema-rest.api.field  #{[:get "/:id"] [:get "/:id/values"]}
   'metabase.user-key-value.api               #{[:get "/namespace/:namespace/key/:key"]
                                                [:put "/namespace/:namespace/key/:key"]}
   'metabase.actions-rest.api                 #{[:post "/:id/execute"]}
   'metabase-enterprise.custom-viz-plugin.api #{[:get "/list"] [:get "/:id/bundle"] [:get "/:id/asset"]}
   'metabase-enterprise.content-translation.routes #{[:get "/dictionary"]}})

(defn- tagged-endpoints
  "API namespace => its endpoints tagged with the data-app scope, among loaded namespaces."
  []
  (into {}
        (keep (fn [a-namespace]
                (when-let [endpoints (not-empty (into #{}
                                                      (for [[[method route] info] (api.macros/ns-routes a-namespace)
                                                            :when (= api-scope.data-app/data-app
                                                                     (get-in info [:form :metadata :scope]))]
                                                        [method route])))]
                  [(ns-name a-namespace) endpoints])))
        (all-ns)))

(deftest data-app-tagged-endpoints-test
  (testing "exactly the endpoints that the SDK's hooks and `StaticQuestion` call inside a data app carry the data-app scope"
    (is (= (into {} (filter (comp find-ns key)) data-app-endpoints)
           (tagged-endpoints)))))
