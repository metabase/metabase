(ns metabase.mcp.v2.tools.visualize-test
  "Contract tests for the v2 MCP Apps tools `visualize_query` and `render_drill_through`
   (GHY-4157), driven through [[metabase.mcp.v2.registry/call-tool]] — the same seam the
   JSON-RPC route uses — so scope gating, the MCP-Apps extension gate, nil-arg stripping,
   Malli validation, and teaching-error conversion are exercised on every call.

   The load-bearing v2 change from v1 is that neither tool puts query data in the model's
   context: the response carries a `query_handle` the iframe resolves out of band. Several
   tests below pin that absence directly."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.core :as mcp.core]
   [metabase.mcp.ui-resource :as mcp.ui-resource]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resources :as v2.resources]
   [metabase.mcp.v2.tools.visualize]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private viz-scopes
  #{"agent:viz:mcp-ui:query" "agent:viz:mcp-ui:drill-through"})

(def ^:private mcp-ui-client
  "A client that advertises the MCP Apps UI extension. Both tools are gated on it."
  {:supports-mcp-ui? true})

(defn- call!
  ([tool-name session-id arguments]
   (call! tool-name session-id arguments mcp-ui-client))
  ([tool-name session-id arguments options]
   (registry/call-tool viz-scopes session-id tool-name arguments options)))

(defn- response-text
  [result]
  (-> result :content first :text))

(defn- payload
  "The `structuredContent` of a successful response. Throws if the tool errored, so a
   tool-level error can never masquerade as an empty payload."
  [result]
  (when (:isError result)
    (throw (ex-info "expected success, got tool error" {:result result})))
  (:structuredContent result))

(defn- error-text
  "The message of a tool-level error. Throws if the call succeeded, so a passing call can
   never satisfy an error assertion."
  [result]
  (when-not (:isError result)
    (throw (ex-info "expected tool error, got success" {:result result})))
  (response-text result))

(defn- orders-query
  "A portable MBQL 5 query over the sample Orders table."
  []
  (let [mp    (lib-be/application-database-metadata-provider (mt/id))
        table (lib.metadata/table mp (mt/id :orders))]
    {:lib/type "mbql/query"
     :stages   [{:lib/type     "mbql.stage/mbql"
                 :source-table [(:name (lib.metadata/database mp)) (:schema table) (:name table)]
                 :limit        5}]}))

(defn- mint-mbql-handle!
  [session-id user-id]
  (let [mp (lib-be/application-database-metadata-provider (mt/id))]
    (common/mint-query-handle!
     session-id user-id
     (common/encode-serialized-query
      (lib/prepare-for-serialization
       (lib/query mp (lib.metadata/table mp (mt/id :orders))))))))

;;; ---------------------------------------------- visualize_query -------------------------------------------------

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest visualize-query-handle-passthrough-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            handle (mint-mbql-handle! sid (mt/user->id :rasta))
            body   (payload (call! "visualize_query" sid {:query_handle handle}))]
        (testing "GHY-4157: a supplied handle is reused as-is rather than re-minted — the stored query is unchanged"
          (is (= handle (:query_handle body))))
        (testing "GHY-4157: the query itself never reaches the model — only the handle does"
          (is (= #{:query_handle} (set (keys body))))
          (is (not (str/includes? (response-text (call! "visualize_query" sid {:query_handle handle}))
                                  "source-table"))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest visualize-query-fresh-query-mints-handle-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid  (str (random-uuid))
            uid  (mt/user->id :rasta)
            body (payload (call! "visualize_query" sid {:query  (orders-query)
                                                        :prompt "show me orders"}))]
        (testing "GHY-4157: an inline query mints a handle instead of echoing the query back"
          (is (string? (:query_handle body)))
          (is (not (contains? body :query))))
        (testing "GHY-4157: the minted handle resolves to the query that was visualized"
          (let [{:keys [query prompt]} (common/resolve-query-handle! sid uid (:query_handle body))]
            (is (some? (get-in query [:stages 0 :source-table])))
            (testing "and carries the prompt for the visualization feedback flow"
              (is (= "show me orders" prompt)))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest visualize-query-display-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            handle (mint-mbql-handle! sid (mt/user->id :rasta))]
        (testing "GHY-4157: a requested display rides along to the iframe"
          (is (= "bar" (:display (payload (call! "visualize_query" sid {:query_handle handle
                                                                        :display      "bar"}))))))
        (testing "GHY-4157: an omitted display stays absent so the iframe infers one from the result shape"
          (is (not (contains? (payload (call! "visualize_query" sid {:query_handle handle}))
                              :display))))
        (testing "GHY-4157: an unknown display is a schema error, not a silently ignored value"
          (is (str/includes? (error-text (call! "visualize_query" sid {:query_handle handle
                                                                       :display      "hologram"}))
                             "Invalid arguments")))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest visualize-query-accepts-native-handle-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            mp     (lib-be/application-database-metadata-provider (mt/id))
            handle (common/mint-query-handle!
                    sid (mt/user->id :rasta)
                    (common/encode-serialized-query
                     (lib/prepare-for-serialization
                      (lib/native-query mp "SELECT 1 AS n"))))]
        (testing "GHY-4157: an execute_sql handle is visualizable — native results are charts too"
          (is (= handle (:query_handle (payload (call! "visualize_query" sid {:query_handle handle}))))))))))

(deftest visualize-query-input-exclusivity-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))]
      (testing "GHY-4157: neither input names both affordances"
        (let [message (error-text (call! "visualize_query" sid {}))]
          (is (str/includes? message "exactly one"))
          (is (str/includes? message "query_handle"))
          (is (str/includes? message "query"))))
      (testing "GHY-4157: both inputs is a teaching error, not a silent precedence rule"
        (is (str/includes? (error-text (call! "visualize_query" sid {:query        (orders-query)
                                                                     :query_handle (str (random-uuid))}))
                           "exactly one"))))))

(deftest visualize-query-rejects-inline-native-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [sid (str (random-uuid))
          mp  (lib-be/application-database-metadata-provider (mt/id))]
      (testing "GHY-4157: inline `query` is MBQL 5 only, matching execute_query — SQL arrives by handle"
        (is (:isError (call! "visualize_query" sid
                             {:query (lib/prepare-for-serialization
                                      (lib/native-query mp "SELECT 1 AS n"))})))))))

(deftest visualize-query-unknown-handle-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "GHY-4157: an unknown handle names the recovery path"
      (is (str/includes? (error-text (call! "visualize_query" (str (random-uuid))
                                            {:query_handle (str (random-uuid))}))
                         "run the query again")))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest visualize-query-handle-is-user-scoped-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [sid    (str (random-uuid))
          handle (mt/with-current-user (mt/user->id :crowberto)
                   (mint-mbql-handle! sid (mt/user->id :crowberto)))]
      (testing "GHY-4157: another user's handle is not resolvable — the handle is not a bearer credential"
        (mt/with-current-user (mt/user->id :rasta)
          (is (:isError (call! "visualize_query" sid {:query_handle handle}))))))))

;;; -------------------------------------------- render_drill_through ----------------------------------------------

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest render-drill-through-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid    (str (random-uuid))
            handle (mint-mbql-handle! sid (mt/user->id :rasta))
            body   (payload (call! "render_drill_through" sid {:query_handle handle}))]
        (testing "GHY-4157: the drill handle the iframe minted is echoed for the iframe to resolve"
          (is (= {:query_handle handle} body)))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest render-drill-through-accepts-iframe-minted-handle-test
  ;; The iframe mints drill handles from the SDK's `dataset_query` (legacy MBQL 4: no `:stages`),
  ;; not from the serialized shape v2's execute tools mint. Resolving these through the execute
  ;; path's guards would reject every real drill-through, so both UI tools read the store raw.
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [sid           (str (random-uuid))
            legacy-query  {:type "query" :database (mt/id) :query {:source-table (mt/id :orders)}}
            handle        (common/mint-query-handle!
                           sid (mt/user->id :rasta)
                           (u/encode-base64 (json/encode legacy-query)))]
        (testing "GHY-4157: a drill handle carrying the iframe's legacy dataset_query renders"
          (is (= {:query_handle handle}
                 (payload (call! "render_drill_through" sid {:query_handle handle})))))
        (testing "GHY-4157: and the same handle is visualizable directly"
          (is (= {:query_handle handle}
                 (payload (call! "visualize_query" sid {:query_handle handle})))))))))

(deftest render-drill-through-unknown-handle-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "GHY-4157: an unknown drill handle is a teaching error, not an empty visualization"
      (is (str/includes? (error-text (call! "render_drill_through" (str (random-uuid))
                                            {:query_handle (str (random-uuid))}))
                         "not found")))))

(deftest render-drill-through-requires-handle-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "GHY-4157: query_handle is required — the tool never runs a query of its own"
      (is (str/includes? (error-text (call! "render_drill_through" (str (random-uuid)) {}))
                         "Invalid arguments")))))

;;; ------------------------------------------------ Client gating -------------------------------------------------

(deftest mcp-app-ui-extension-gating-test
  (testing "GHY-4157: MCP Apps tools are hidden from clients that cannot render an iframe"
    (let [visible (fn [options] (set (map :name (registry/list-tools viz-scopes options))))]
      (is (= #{"visualize_query" "render_drill_through"} (visible {:supports-mcp-ui? true})))
      (is (= #{} (visible {:supports-mcp-ui? false})))))
  (testing "GHY-4157: calling one from an incapable client says what the client is missing"
    (mt/with-current-user (mt/user->id :rasta)
      (let [message (error-text (call! "visualize_query" (str (random-uuid))
                                       {:query_handle (str (random-uuid))}
                                       {:supports-mcp-ui? false}))]
        (is (str/includes? message "MCP Apps UI"))
        (is (str/includes? message "text/html;profile=mcp-app"))))))

(deftest scope-gating-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "GHY-4157: each MCP Apps tool is gated on its own scope"
      (is (str/includes? (-> (registry/call-tool #{"agent:query:execute"} (str (random-uuid))
                                                 "visualize_query" {:query_handle (str (random-uuid))}
                                                 mcp-ui-client)
                             response-text)
                         "Insufficient scope")))))

;;; ------------------------------------------------- Manifest -----------------------------------------------------

(deftest ui-tool-manifest-test
  (let [by-name (into {} (map (juxt :name identity))
                      (registry/list-tools viz-scopes mcp-ui-client))]
    (testing "GHY-4157: each UI tool points the host at the iframe shell it renders into"
      (is (= v2.resources/visualize-query-uri
             (get-in by-name ["visualize_query" :_meta :ui :resourceUri])))
      (is (= v2.resources/render-drill-through-uri
             (get-in by-name ["render_drill_through" :_meta :ui :resourceUri]))))
    (testing "GHY-4157: distinct resource URIs — a host that dedupes mounted iframes by URI would drop the second"
      (is (not= v2.resources/visualize-query-uri v2.resources/render-drill-through-uri)))
    (testing "GHY-4157: the published output schema documents the handle the iframe resolves"
      (is (= [:query_handle]
             (get-in by-name ["render_drill_through" :outputSchema :required])))
      (is (contains? (get-in by-name ["visualize_query" :outputSchema :properties]) :query_handle)))))

(deftest tool-and-resource-scopes-agree-test
  (testing "GHY-4157: the scope that calls a tool is the scope that reads the iframe it renders — a token holding one always holds the other"
    (mt/with-current-user (mt/user->id :rasta)
      (doseq [[tool-name uri] {"visualize_query"      v2.resources/visualize-query-uri
                               "render_drill_through" v2.resources/render-drill-through-uri}]
        (let [scope     (v2.resources/resource-scope uri)
              only-this #{scope}]
          (is (some? scope) (str uri " is registered with a scope"))
          (testing (str tool-name " is listed to a token holding only its resource scope")
            (is (contains? (set (map :name (registry/list-tools only-this mcp-ui-client)))
                           tool-name)))
          (testing (str tool-name " is callable by that same token")
            ;; An unknown handle: the call gets past scope and extension gating to the handle
            ;; lookup, which is the point — a scope rejection would read "Insufficient scope".
            (is (not (str/includes? (-> (registry/call-tool only-this (str (random-uuid)) tool-name
                                                            {:query_handle (str (random-uuid))}
                                                            mcp-ui-client)
                                        response-text)
                                    "Insufficient scope"))))
          (testing (str tool-name " can read the shell it points at")
            (is (= :ok (:status (mcp.ui-resource/with-fallback-template
                                  (v2.resources/read-resource uri only-this {})))))))))))

;;; ------------------------------------------------- Resources ----------------------------------------------------

(deftest resource-scopes-are-advertised-test
  (testing "GHY-4157: every v2 resource scope is in the OAuth grant — one a client can't request is a shell it could never read"
    (let [advertised (set (mcp.core/all-scopes))]
      (doseq [scope (v2.resources/resource-scopes)]
        (is (contains? advertised scope) scope)))))

(deftest resources-scope-gating-test
  (testing "GHY-4157: resources/list only shows shells the token can read"
    (is (= #{v2.resources/visualize-query-uri v2.resources/render-drill-through-uri}
           (set (map :uri (:resources (v2.resources/list-resources viz-scopes))))))
    (is (= #{v2.resources/visualize-query-uri}
           (set (map :uri (:resources (v2.resources/list-resources #{"agent:viz:mcp-ui:query"}))))))
    (is (empty? (:resources (v2.resources/list-resources #{"agent:query:execute"})))))
  (testing "GHY-4157: reading a shell without its scope is denied, not served"
    (is (= :scope-denied (:status (v2.resources/read-resource v2.resources/visualize-query-uri
                                                              #{"agent:query:execute"} {}))))
    (is (= :not-found (:status (v2.resources/read-resource "ui://metabase/nope.html"
                                                           viz-scopes {}))))))

(deftest resource-read-renders-iframe-shell-test
  (mcp.ui-resource/with-fallback-template
    (testing "GHY-4157: the shell carries the embedding session token the iframe authenticates with"
      (let [result (v2.resources/read-resource v2.resources/visualize-query-uri
                                               viz-scopes
                                               {:session-key "test-session-key"
                                                :session-id  "test-session-id"})
            {:keys [text mimeType _meta]} (first (:contents result))]
        (is (= :ok (:status result)))
        (is (= "text/html;profile=mcp-app" mimeType))
        (is (str/includes? text (json/encode "test-session-key")))
        (testing "and the host gets the sandbox CSP block it needs to render it"
          (is (contains? (:ui _meta) :csp))
          (is (true? (get-in _meta [:ui :prefersBorder]))))))
    (testing "GHY-4157: the two shells hash differently — a CDN that dedupes by body would drop one"
      (let [render (fn [uri] (-> (v2.resources/read-resource uri viz-scopes {}) :contents first :text))]
        (is (not= (render v2.resources/visualize-query-uri)
                  (render v2.resources/render-drill-through-uri)))))))
