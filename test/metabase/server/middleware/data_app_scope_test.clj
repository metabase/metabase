(ns metabase.server.middleware.data-app-scope-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.api-scope.data-app :as api-scope.data-app]
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
    (is (api-scope/registered-scope? api-scope.data-app/data-app))))

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
    (testing "the data-app read/query surface still passes scope enforcement when marked"
      (is (mt/user-http-request :crowberto :get 200 "collection/root" as-data-app)))
    (testing "the feature-surface reads (downloads pref, alerts probe) are reachable when marked"
      ;; POST /api/action/:id/execute (write-back for `useAction`) is tagged too, but needs an
      ;; action fixture — actions.cy.spec.ts is its functional guard under enforcement.
      (is (mt/user-http-request :crowberto :get 200 "pulse/form_input" as-data-app))
      ;; 204 (not scope_not_permitted) proves the marked request reached the handler; the key is unset.
      (is (nil? (mt/user-http-request :crowberto :get 204
                                      "user-key-value/namespace/data-app-test/key/format" as-data-app))))
    (testing "the user-key-value key a marked request writes is one it can also clear"
      ;; The delete body is irrelevant — reaching the handler at all is what the tag buys.
      (is (not= "scope_not_permitted"
                (:error (mt/user-http-request :crowberto :delete
                                              "user-key-value/namespace/data-app-test/key/format"
                                              as-data-app)))))
    (testing "the InteractiveQuestion.Editor data-source surface is reachable when marked"
      (is (mt/user-http-request :crowberto :get 200 "database" as-data-app)))
    (testing "a pre-built-def route (table-routes, mounted by value not ns-symbol) enforces the tag"
      (is (mt/user-http-request :crowberto :get 200
                                (format "table/%d/query_metadata" (mt/id :venues)) as-data-app)))))
