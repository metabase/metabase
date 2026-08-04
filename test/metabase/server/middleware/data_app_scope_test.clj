(ns metabase.server.middleware.data-app-scope-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   ;; loaded for its side effect — registering the "data-app" scope — so the registry assertion
   ;; below holds even when this namespace is loaded in isolation
   [metabase.api-scope.data-app]
   [metabase.server.middleware.data-app-scope :as mw.data-app-scope]
   [metabase.test :as mt]))

;; Keeps the side-effecting require above from being flagged as an unused namespace.
(comment metabase.api-scope.data-app/data-app)

(def ^:private unrestricted :metabase.api.macros.scope/unrestricted)

(def ^:private marker
  {:headers {"x-metabase-client" "data-app"}})

(defn- token-scopes-seen
  "Run `wrap-data-app-scope` over `request` and return the `:token-scopes` its inner handler saw."
  [request]
  (let [seen    (promise)
        handler (mw.data-app-scope/wrap-data-app-scope
                 (fn [req respond _raise] (respond (:token-scopes req))))]
    ;; A Clojure promise implements IFn via `deliver`, so it works directly as the `respond` callback.
    (handler request seen identity)
    (deref seen 1000 ::timeout)))

(deftest ^:parallel wrap-data-app-scope-test
  (testing "an X-Metabase-Client: data-app request from a normal session narrows to the data-app scope"
    (is (= #{"data-app"} (token-scopes-seen marker))))
  (testing "it narrows a full-access (::unrestricted) token down to the data-app scope"
    (is (= #{"data-app"} (token-scopes-seen (assoc marker :token-scopes #{unrestricted})))))
  (testing "a dev/preview data app is confined too — the X-Metabase-Client header is still \"data-app\"
            (the \"-preview\" suffix lives only on the analytics *client* var, not the header)"
    (is (= #{"data-app"}
           (token-scopes-seen {:headers {"x-metabase-client"          "data-app"
                                         "x-metabase-embedded-preview" "true"}}))))
  (testing "a non-data-app client leaves token-scopes untouched (normal session = unrestricted by omission)"
    (is (nil? (token-scopes-seen {:headers {"x-metabase-client" "embedding-sdk-react"}})))
    (is (nil? (token-scopes-seen {:headers {}}))))
  (testing "it never broadens an already-scoped token — an OAuth/agent token is left as-is"
    (is (= #{"agent:search"} (token-scopes-seen (assoc marker :token-scopes #{"agent:search"}))))))

(deftest ^:parallel data-app-scope-registered-test
  (testing "the data-app scope is registered so tagged endpoints don't warn about an unknown scope"
    (is (api-scope/registered-scope? "data-app"))))

(deftest data-app-marker-enforces-endpoint-scope-test
  ;; Mirrors the endpoints probed by the e2e spec
  ;; (e2e/test/scenarios/data-apps/sandboxing_isolation.cy.spec.ts) so both layers stay in sync.
  (let [as-data-app {:request-options {:headers {"x-metabase-client" "data-app"}}}
        ;; Untagged endpoints an admin session can otherwise reach: identity, the permission
        ;; graph, and instance settings — the privileged surface a sandboxed app must not touch.
        privileged  ["user/current" "permissions/graph" "setting"]]
    (testing "an admin session reaches the privileged endpoints without the data-app client header"
      (doseq [endpoint privileged]
        (is (mt/user-http-request :crowberto :get 200 endpoint) endpoint)))
    (testing "the same endpoints fail closed once the request is marked as a data app"
      (doseq [endpoint privileged]
        (is (= "scope_not_permitted"
               (:error (mt/user-http-request :crowberto :get 403 endpoint as-data-app)))
            endpoint)))
    (testing "the data-app read/query surface still passes scope enforcement when marked"
      (is (mt/user-http-request :crowberto :get 200 "collection/root" as-data-app)))
    (testing "the feature-surface reads (downloads pref, alerts probe) are reachable when marked"
      ;; POST /api/action/:id/execute (write-back for `useAction`) is tagged too, but needs an
      ;; action fixture — actions.cy.spec.ts is its functional guard under enforcement.
      (is (mt/user-http-request :crowberto :get 200 "pulse/form_input" as-data-app))
      ;; 204 (not scope_not_permitted) proves the marked request reached the handler; the key is unset.
      (is (nil? (mt/user-http-request :crowberto :get 204
                                      "user-key-value/namespace/data-app-test/key/format" as-data-app))))
    (testing "the InteractiveQuestion.Editor data-source surface is reachable when marked"
      (is (mt/user-http-request :crowberto :get 200 "database" as-data-app)))
    (testing "a pre-built-def route (table-routes, mounted by value not ns-symbol) enforces the tag"
      (is (mt/user-http-request :crowberto :get 200
                                (format "table/%d/query_metadata" (mt/id :venues)) as-data-app)))))
