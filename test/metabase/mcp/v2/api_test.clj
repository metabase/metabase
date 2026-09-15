(ns metabase.mcp.v2.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.ai-tracing.core :as ait]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.mcp.paths :as mcp.paths]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.ui-resource :as mcp.ui-resource]
   [metabase.mcp.v2.api :as v2.api]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resources :as v2.resources]
   [metabase.mcp.v2.test-util]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.json :as json]
   [oidc-provider.util :as oidc.util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private endpoint "metabase-mcp")

(defn- mcp-request
  ([body]
   (mcp-request body {}))
  ([body extra-headers]
   (client/client-full-response (test.users/username->token :crowberto)
                                :post endpoint
                                {:request-options {:headers extra-headers}}
                                body)))

(defn- jsonrpc-request
  ([method] (jsonrpc-request method {}))
  ([method params] {:jsonrpc "2.0" :method method :params params :id 1}))

(defn- initialize!
  "Perform the initialize handshake; returns [session-id init-response]."
  []
  (let [response   (mcp-request (jsonrpc-request "initialize" {:capabilities {}}))
        session-id (get-in response [:headers "Mcp-Session-Id"])]
    (mcp-request {:jsonrpc "2.0" :method "notifications/initialized" :params {}}
                 {"mcp-session-id" session-id})
    [session-id response]))

(deftest mcp-enabled-gate-test
  (testing "the route serves by default — `mcp-enabled?` is the admin toggle and defaults to true"
    (is (= 200 (:status (mcp-request (jsonrpc-request "initialize"))))))
  (testing "GHY-4250: the admin toggle darkens the surface"
    (mt/with-temporary-setting-values [mcp.settings/mcp-enabled? false]
      (let [response (mcp-request (jsonrpc-request "initialize"))]
        (is (= 403 (:status response)))
        (is (= "MCP server is not enabled." (:body response)))))))

(deftest every-alias-serves-v2-test
  (testing "GHY-4250: every MCP path reaches THIS surface now that the legacy paths are repointed. A 200 and
            a session header are not enough to prove that — the retired v1 handler produced both — so each
            alias is asked for its tool list and must name a v2-only tool. Reverting either route entry (or a
            merge-forward resolving the wrong way) fails here rather than passing silently."
    (doseq [path ["metabase-mcp" "mcp"]]
      (testing path
        (let [init       (client/client-full-response (test.users/username->token :crowberto)
                                                      :post path
                                                      {:request-options {:headers {}}}
                                                      (jsonrpc-request "initialize"))
              session-id (get-in init [:headers "Mcp-Session-Id"])
              tools      (-> (client/client-full-response
                              (test.users/username->token :crowberto)
                              :post path
                              {:request-options {:headers {"mcp-session-id" session-id}}}
                              (jsonrpc-request "tools/list"))
                             (get-in [:body :result :tools]))]
          (is (= 200 (:status init)))
          (is (some? session-id))
          (is (some #(= "learn" (:name %)) tools)
              "learn is registered only by the v2 registry, so seeing it proves v2 answered"))))))

(deftest alias-discovery-challenge-names-the-path-the-client-hit-test
  (testing "GHY-4250: an unauthenticated request gets a 401 whose resource_metadata names the alias the client
            actually connected through, not the canonical path — a client configured against /api/mcp must be
            pointed back at /api/mcp. Ported from v1's api-test, which carried this until v1 was deleted."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (doseq [[path expected] [["metabase-mcp" "/api/metabase-mcp"]
                               ["mcp"          "/api/mcp"]]]
        (testing path
          (let [response (client/client-full-response :post 401 path
                                                      {:request-options {:headers {}}}
                                                      (jsonrpc-request "initialize"))
                header   (get-in response [:headers "WWW-Authenticate"])]
            ;; The closing quote anchors the match: without it "/api/mcp" also matches "/api/metabase-mcp".
            (is (str/includes? header (str "oauth-protected-resource" expected "\"")))))))))

(deftest initialize-test
  (testing "initialize returns the handshake and a session header"
    (let [[session-id response] (initialize!)]
      (is (= 200 (:status response)))
      (is (some? session-id))
      (is (= "2025-03-26" (get-in response [:body :result :protocolVersion])))
      (is (= {:name "metabase" :version "0.1.0"} (get-in response [:body :result :serverInfo])))
      (testing "GHY-4157: tools and resources are advertised — resources serve the MCP Apps iframe shells; prompts stay unimplemented and so unadvertised"
        (is (= {:tools {:listChanged true} :resources {}}
               (get-in response [:body :result :capabilities]))))
      (testing "the handshake carries the skills instructions — the one pre-tool-call channel"
        (is (re-find #"learn\(\)" (get-in response [:body :result :instructions])))))))

(deftest initialize-instructions-explain-scope-failures-test
  (testing "GHY-4543: clients replace a scope denial with their own text (Claude Code: \"requires re-authorization
            (token expired)\", Codex: \"Insufficient scope\", mcp-remote: \"Tool execution failed\"), so the model
            tells the user their login expired. The instructions are the one channel that reaches the model first,
            so they must say what that failure really means and how the user fixes it."
    (let [[_ response]  (initialize!)
          instructions (get-in response [:body :result :instructions])]
      (testing "the client-side failure texts are recognized"
        (doseq [re [#"(?i)re-authoriz" #"(?i)expired" #"(?i)insufficient scope" #"Unauthorized"
                    #"(?i)tool execution failed"]]
          (is (re-find re instructions) (str re))))
      (testing "the cause is a missing permission, not an expired login"
        (is (re-find #"(?i)missing permission" instructions))
        (is (re-find #"(?i)not an expired login" instructions)))
      (testing "a resource read is refused the same way as a tool call, so the guidance covers both"
        (is (re-find #"(?i)tool call or resource read" instructions)))
      (testing "the model names the tool and the permission, as the consent screen names it"
        (is (re-find #"(?i)which tool" instructions))
        (is (re-find #"(?i)which permission" instructions))
        (is (re-find #"(?i)consent screen" instructions))
        (testing "and finds that name where the description puts it: first, ahead of any client truncation"
          (is (re-find #"(?i)sentence that starts the tool's description" instructions))
          (is (not (re-find #"(?i)ends the tool's description" instructions)))))
      (testing "the user reconnects, with steps for common clients"
        (is (re-find #"(?i)re-?authenticate|reconnect" instructions))
        (is (str/includes? instructions "/mcp"))
        (is (str/includes? instructions "codex mcp login")))
      (testing "no retry until the user has reconnected"
        (is (re-find #"(?i)(don't|do not) retry" instructions)))
      (testing "the consent screen is all-or-nothing, so the model must not invent a step to tick a permission"
        (is (re-find #"(?i)no per-permission" instructions)))
      (testing "the skills guidance is kept"
        (is (re-find #"learn\(\)" instructions))))))

(defn- do-with-tools-listed-by-grant!
  "Call `f` with `{grant tools}`: the `tools/list` result for a cookie session (`\"cookie session\"`) and for Bearer
   tokens holding various scope grants."
  [f]
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (oauth-server.tu/with-oauth-client [client-id]
      (mt/with-model-cleanup [:model/OAuthAccessToken]
        (let [bearer-tools (fn [scopes]
                             (let [token   (str (random-uuid))
                                   headers {"authorization" (str "Bearer " token)}]
                               (t2/insert! :model/OAuthAccessToken
                                           {:token     (oidc.util/hash-token token)
                                            :user_id   (mt/user->id :crowberto)
                                            :client_id client-id
                                            :scope     scopes
                                            :expiry    (+ (System/currentTimeMillis) 3600000)})
                               (let [session-id (-> (client/client-full-response
                                                     :post 200 endpoint
                                                     {:request-options {:headers headers}}
                                                     (jsonrpc-request "initialize" {:capabilities {}}))
                                                    (get-in [:headers "Mcp-Session-Id"]))]
                                 (-> (client/client-full-response
                                      :post 200 endpoint
                                      {:request-options {:headers (assoc headers "mcp-session-id" session-id)}}
                                      (jsonrpc-request "tools/list"))
                                     (get-in [:body :result :tools])))))
              cookie-tools (let [[session-id _] (initialize!)]
                             (-> (mcp-request (jsonrpc-request "tools/list") {"mcp-session-id" session-id})
                                 (get-in [:body :result :tools])))]
          (f {"cookie session" cookie-tools
              "content:read"   (bearer-tools ["agent:content:read"])
              "query:run"      (bearer-tools ["agent:query:run"])
              "all v2 scopes"  (bearer-tools (vec mcp.paths/v2-surface-scopes))}))))))

(deftest tools-list-descriptions-are-token-independent-test
  (testing "GHY-4543: a tool's description is byte-identical whatever the caller's token holds. Claude Code keeps the
            first description it loads for the whole session, so text that varied with the grant (\"not available on
            this connection\") would outlive a successful re-auth and the model would refuse a tool that now works."
    (do-with-tools-listed-by-grant!
     (fn [by-grant]
       (let [descriptions (update-vals by-grant #(into {} (map (juxt :name :description)) %))
             unrestricted (descriptions "cookie session")]
         (doseq [[grant listed]            (dissoc descriptions "cookie session")
                 [tool-name description] listed]
           (testing (str grant " " tool-name)
             (is (= (get unrestricted tool-name) description))))
         (testing "the comparison has teeth: callers with different grants see the same leading permission text"
           (doseq [grant ["cookie session" "query:run" "all v2 scopes"]]
             (is (re-find #"\ARequires the \"[^\"]+\" permission \(agent:query:run\)\.\n\n"
                          (get-in descriptions [grant "execute_query"]))))))))))

(deftest tools-list-security-schemes-are-token-independent-test
  (testing "GHY-4543: every tool descriptor declares the OAuth scope it needs in `securitySchemes`, which ChatGPT reads
            to decide what to step up for. Clients cache descriptors for the session, so the JSON is byte-identical
            whatever the caller's token holds."
    (do-with-tools-listed-by-grant!
     (fn [by-grant]
       (let [schemes-json (update-vals by-grant #(into {} (map (juxt :name (comp json/encode :securitySchemes))) %))
             unrestricted (schemes-json "cookie session")]
         (testing "each tool declares its own scope"
           (is (= "[{\"type\":\"oauth2\",\"scopes\":[\"agent:content:read\"]}]" (get unrestricted "test_echo")))
           (is (= "[{\"type\":\"oauth2\",\"scopes\":[\"agent:sql:run\"]}]" (get unrestricted "execute_sql")))
           (is (= "[{\"type\":\"oauth2\",\"scopes\":[\"agent:query:run\"]}]" (get unrestricted "execute_query"))))
         (doseq [[grant listed]        schemes-json
                 [tool-name schemes] listed]
           (testing (str grant " " tool-name)
             (is (not= "null" schemes))
             (is (= (get unrestricted tool-name) schemes)))))))))

(deftest tools-list-test
  (let [[session-id _] (initialize!)
        response       (mcp-request (jsonrpc-request "tools/list")
                                    {"mcp-session-id" session-id})
        tools          (get-in response [:body :result :tools])]
    (testing "the registry drives tools/list; cookie sessions see every tool"
      (is (= 200 (:status response)))
      (is (some #(= "test_echo" (:name %)) tools)))
    (testing "inputSchema is strict JSON Schema (required + closed), safe for strict clients"
      (let [schema (:inputSchema (first (filter #(= "test_echo" (:name %)) tools)))]
        (is (= "object" (:type schema)))
        (is (false? (:additionalProperties schema)))))))

(deftest tools-call-test
  (let [[session-id _] (initialize!)]
    (testing "tools/call dispatches through the registry"
      (let [response (mcp-request (jsonrpc-request "tools/call" {:name "test_echo" :arguments {}})
                                  {"mcp-session-id" session-id})
            result   (get-in response [:body :result])]
        (is (= 200 (:status response)))
        (is (not (:isError result)))
        (is (= {:ok true :message "pong"} (:structuredContent result)))))
    (testing "argument validation failures are JSON-RPC invalid-params errors, not MCP tool results"
      (let [response (mcp-request (jsonrpc-request "tools/call"
                                                   {:name "test_echo" :arguments {:message 42}})
                                  {"mcp-session-id" session-id})]
        (is (= -32602 (get-in response [:body :error :code])))
        (is (str/starts-with? (get-in response [:body :error :message]) "Invalid arguments"))
        (is (not (contains? (:body response) :result)))))
    (testing "an unknown tool is a JSON-RPC method-not-found error"
      (let [response (mcp-request (jsonrpc-request "tools/call" {:name "nope" :arguments {}})
                                  {"mcp-session-id" session-id})]
        (is (= -32601 (get-in response [:body :error :code])))
        (is (= "Unknown tool: nope" (get-in response [:body :error :message])))
        (is (not (contains? (:body response) :result)))))))

(deftest disabled-tools-kill-switch-test
  (let [[session-id _] (initialize!)]
    (mt/with-temporary-setting-values [mcp.settings/mcp-v2-disabled-tools ["test_echo"]]
      (testing "a disabled tool disappears from tools/list"
        (let [response (mcp-request (jsonrpc-request "tools/list")
                                    {"mcp-session-id" session-id})]
          (is (not (some #(= "test_echo" (:name %))
                         (get-in response [:body :result :tools]))))))
      (testing "a disabled tool is rejected by tools/call as if it never existed"
        (let [response (mcp-request (jsonrpc-request "tools/call" {:name "test_echo" :arguments {}})
                                    {"mcp-session-id" session-id})]
          (is (= -32601 (get-in response [:body :error :code])))
          (is (= "Unknown tool: test_echo" (get-in response [:body :error :message])))
          (is (not (contains? (:body response) :result))))))))

(deftest method-dispatch-fallthrough-test
  (let [[session-id _] (initialize!)]
    (testing "methods the surface can't serve fall through to JSON-RPC method-not-found"
      (doseq [method ["prompts/list"]]
        (testing method
          (let [response (mcp-request (jsonrpc-request method)
                                      {"mcp-session-id" session-id})]
            (is (= -32601 (get-in response [:body :error :code])))
            (is (str/includes? (get-in response [:body :error :message]) "Method not found"))))))
    (testing "ping is handled and returns an empty success result, not a fallthrough error"
      (let [response (mcp-request (jsonrpc-request "ping")
                                  {"mcp-session-id" session-id})]
        (is (= 200 (:status response)))
        (is (nil? (get-in response [:body :error])))
        (is (= {} (get-in response [:body :result])))))))

(deftest resources-list-and-read-test
  (mcp.ui-resource/with-fallback-template
    (let [[session-id _] (initialize!)
          listed (-> (mcp-request (jsonrpc-request "resources/list")
                                  {"mcp-session-id" session-id})
                     (get-in [:body :result :resources]))]
      (testing "GHY-4157: resources/list serves the MCP Apps iframe shells and the fields catalog"
        (is (= #{v2.resources/visualize-query-uri v2.resources/render-drill-through-uri
                 v2.resources/fields-catalog-uri}
               (set (map :uri listed))))
        (is (every? #(= "text/html;profile=mcp-app" (:mimeType %))
                    (remove #(= v2.resources/fields-catalog-uri (:uri %)) listed)))
        (is (= "application/json"
               (:mimeType (first (filter #(= v2.resources/fields-catalog-uri (:uri %)) listed))))))
      (testing "GHY-4157: resources/read renders a shell the host can sandbox"
        (let [content (-> (mcp-request (jsonrpc-request "resources/read"
                                                        {:uri v2.resources/visualize-query-uri})
                                       {"mcp-session-id" session-id})
                          (get-in [:body :result :contents])
                          first)]
          (is (= v2.resources/visualize-query-uri (:uri content)))
          (is (str/includes? (:text content) "metabaseConfig"))
          (is (contains? (get-in content [:_meta :ui]) :csp))))
      (testing "GHY-4157: an unknown URI is an invalid-params error, not a rendered shell"
        (let [response (mcp-request (jsonrpc-request "resources/read" {:uri "ui://metabase/nope.html"})
                                    {"mcp-session-id" session-id})]
          (is (= -32602 (get-in response [:body :error :code])))))
      (testing "GHY-4157: a missing uri parameter is rejected"
        (let [response (mcp-request (jsonrpc-request "resources/read" {})
                                    {"mcp-session-id" session-id})]
          (is (= -32602 (get-in response [:body :error :code]))))))))

(deftest credential-is-minted-only-where-it-is-embedded-test
  (testing "GHY-4157: `resources/read` minted a UI credential before it knew what had been asked for, so every
            read paid for one and handed it to the render — including data resources whose render-fn ignores it,
            and reads that turn out to be unknown. A credential is a live 5-minute authenticator
            for the /api/dataset surface; it should exist only where something actually embeds it, so that a
            resource added later cannot start leaking one by accident."
    (mcp.ui-resource/with-fallback-template
      (let [[session-id _] (initialize!)
            minted (atom 0)]
        ;; Delegation captures the original through `mt/original-fn` — a value captured before the
        ;; redef would be the dynamic-redef proxy if an earlier test already patched the var.
        (mt/with-dynamic-fn-redefs [mcp.session/issue-ui-credential
                                    (fn [& args]
                                      (swap! minted inc)
                                      (apply (mt/original-fn #'mcp.session/issue-ui-credential) args))]
          (testing "a data resource does not mint one — its render-fn never asks"
            (mcp-request (jsonrpc-request "resources/read" {:uri v2.resources/fields-catalog-uri})
                         {"mcp-session-id" session-id})
            (is (zero? @minted)))
          (testing "nor does a read that resolves to nothing"
            (mcp-request (jsonrpc-request "resources/read" {:uri "ui://metabase/nope.html"})
                         {"mcp-session-id" session-id})
            (is (zero? @minted)))
          (testing "the iframe shell still gets exactly one, and still embeds it"
            (let [text (-> (mcp-request (jsonrpc-request "resources/read"
                                                         {:uri v2.resources/visualize-query-uri})
                                        {"mcp-session-id" session-id})
                           (get-in [:body :result :contents])
                           first
                           :text)]
              (is (= 1 @minted))
              (is (str/includes? text "uiCredential")))))))))

(deftest ^:parallel v2-surface-scopes-match-metabot-scope-test
  (testing "`v2-surface-scopes` spells its scopes as literals because `metabase.mcp.paths` must stay
            dependency-free — `metabase.server.middleware.security` requires `metabase.mcp.core`, so requiring
            `metabot.scope` from anything `mcp.core` reaches deadlocks namespace loading at web-server start.
            This is what keeps the literals honest in place of that require."
    (is (= [metabot.scope/agent-content-read
            metabot.scope/agent-content-write
            metabot.scope/agent-query-run
            metabot.scope/agent-sql-run
            metabot.scope/agent-delivery-write
            metabot.scope/agent-resource-read]
           mcp.paths/v2-surface-scopes))))

(deftest ^:parallel challenge-scopes-are-grantable-test
  (testing "GHY-4226: the 401 challenge tells an uninstructed client what to ask for, and a dynamic client's
            ceiling always includes the default grant, which is what the OAuth server validates a requested scope
            against. A challenge naming scopes that set does not contain is not merely over-broad — a fresh client
            asks for exactly what it was told, is answered \"Invalid scope\", and the connect fails outright. The
            surface becomes unreachable over OAuth."
    (let [grantable (set ((requiring-resolve 'metabase.oauth-server.core/default-grant-scopes)))]
      (doseq [scope @#'v2.api/default-ask-scopes]
        (testing scope
          (is (contains? grantable scope)
              "a scope the v2 challenge asks for must be one the OAuth server will actually grant")))))
  (testing "GHY-4543: the challenge asks for the baseline, a subset of what the surface accepts, in surface order"
    (is (= ["agent:content:read" "agent:query:run" "agent:resource:read"] @#'v2.api/default-ask-scopes))
    (is (= @#'v2.api/default-ask-scopes (filterv (set @#'v2.api/default-ask-scopes) mcp.paths/v2-surface-scopes)))))

(def ^:private mcp-app-ui-capabilities
  "The `initialize` capabilities an MCP Apps host advertises. Tools gated on `:mcp-app-ui` are hidden from — and
  refused to — a client that does not send this, so any test driving one has to handshake as a capable client."
  {:capabilities {:extensions {:io.modelcontextprotocol/ui {:mimeTypes ["text/html;profile=mcp-app"]}}}})

(defn- initialize-ui-client!
  "Handshake as a client that can render MCP Apps, returning the session id."
  []
  (-> (mcp-request (jsonrpc-request "initialize" mcp-app-ui-capabilities))
      (get-in [:headers "Mcp-Session-Id"])))

(deftest tools-list-permission-sentence-survives-client-truncation-test
  (testing "GHY-4543: Claude Code (2.1.271) truncates each tool description at 2048 characters. After a scope denial
            the model names the missing permission from the \"Requires the … permission\" sentence, so for every
            tool `tools/list` sends, that sentence must lie entirely within the first 2048 characters."
    (let [session-id (initialize-ui-client!)
          tools      (-> (mcp-request (jsonrpc-request "tools/list") {"mcp-session-id" session-id})
                         (get-in [:body :result :tools]))
          names      (set (map :name tools))]
      (testing "the check covers the descriptions long enough to lose an appended sentence"
        (is (contains? names "document_write"))
        (is (contains? names "execute_query")))
      (doseq [{tool-name :name :keys [description]} tools]
        (testing tool-name
          (let [sentence (re-find #"Requires the (?:\"[^\"]+\" permission \([^)\s]+\)|\S+ permission)\." description)
                end      (some->> sentence (str/index-of description) (+ (count sentence)))]
            (is (some? sentence))
            (is (and end (<= end 2048))
                (str "the permission sentence ends at character " end))))))))

(deftest tools-list-descriptions-fit-client-truncation-test
  (testing "GHY-4543: Claude Code (2.1.271) truncates each tool description at 2048 characters, silently dropping
            whatever guidance comes after. Every description `tools/list` sends, MCP Apps tools included and the
            leading permission sentence counted, must fit within that limit."
    (let [session-id (initialize-ui-client!)
          tools      (-> (mcp-request (jsonrpc-request "tools/list") {"mcp-session-id" session-id})
                         (get-in [:body :result :tools]))
          names      (set (map :name tools))]
      (testing "the check covers the longest descriptions and the MCP Apps tools"
        (is (every? names ["document_write" "execute_query" "get_content" "refresh_ui_credential"])))
      (doseq [{tool-name :name :keys [description]} tools]
        (testing tool-name
          (is (<= (count description) 2048)
              (str "the description is " (count description) " characters")))))))

(deftest refresh-ui-credential-test
  (testing "GHY-4157: #81041 moved MCP Apps credential delivery out of the rendered shell and into a server
            tool — the production template carries no `uiCredential` placeholder any more. v1 got the tool;
            v2 did not, so a v2 iframe booted with no credential, called `refresh_ui_credential`, and got
            unknown-tool. The widget could not load at all."
    (let [session-id (initialize-ui-client!)
          call!      (fn [] (-> (mcp-request (jsonrpc-request "tools/call"
                                                              {:name "refresh_ui_credential" :arguments {}})
                                             {"mcp-session-id" session-id})
                                (get-in [:body :result])))]
      (testing "the tool exists on v2 and hands back a resolvable credential in private _meta"
        (let [result (call!)]
          (is (not (:isError result)))
          (let [{:keys [credential sessionId]} (get-in result [:_meta :com.metabase/mcp-apps])]
            (is (= session-id sessionId))
            (is (some? (mcp.session/resolve-ui-credential credential))))))
      (testing "the credential it mints is scoped, never the v1 legacy exemption — a tool minting through the
                2-arity would opt v2 back out of the native-SQL gate"
        (let [claims (-> (call!) (get-in [:_meta :com.metabase/mcp-apps :credential])
                         mcp.session/resolve-ui-credential)]
          (is (nil? (:legacy claims)))
          (is (contains? claims :scp))))
      (testing "it is hidden from clients that cannot render an iframe, like the shells it serves"
        (is (not (some #(= "refresh_ui_credential" (:name %))
                       (registry/list-tools {:supports-mcp-ui? false}))))
        (is (some #(= "refresh_ui_credential" (:name %))
                  (registry/list-tools {:supports-mcp-ui? true}))))
      (testing "and refused to them over the wire — hiding is not enforcement; a text-only model must never be
                handed a live /api/dataset authenticator by calling the tool by name"
        (let [plain-session (-> (mcp-request (jsonrpc-request "initialize" {:capabilities {}}))
                                (get-in [:headers "Mcp-Session-Id"]))
              response      (mcp-request (jsonrpc-request "tools/call"
                                                          {:name "refresh_ui_credential" :arguments {}})
                                         {"mcp-session-id" plain-session})]
          (is (= -32602 (get-in response [:body :error :code])))
          (is (not (contains? (:body response) :result))))))))

(deftest refresh-ui-credential-is-redacted-from-the-transport-trace-test
  (testing "the transport records the whole JSON-RPC response one frame above the registry's tool-output
            trace; over the wire, no recorded frame may carry the credential the client receives"
    (let [recorded   (atom [])
          session-id (initialize-ui-client!)
          credential (mt/with-dynamic-fn-redefs [ait/record! (fn [m] (swap! recorded conj m))]
                       (-> (mcp-request (jsonrpc-request "tools/call"
                                                         {:name "refresh_ui_credential" :arguments {}})
                                        {"mcp-session-id" session-id})
                           (get-in [:body :result :_meta :com.metabase/mcp-apps :credential])))]
      (is (string? credential) "the client must still receive the credential")
      (is (seq (filter :mcp/response @recorded)) "the transport frame must actually be recorded")
      (is (not-any? #(str/includes? (pr-str %) credential) @recorded)))))

(deftest refresh-ui-credential-is-redacted-from-traces-test
  (testing "GHY-4157: the credential rides tool-result `_meta`, and `call-tool` records the whole result into
            the eval trace. Recording it verbatim parks a live 5-minute authenticator in trace files and the
            superuser-readable ai-tracing API. v1 strips the same channel before tracing
            (`mcp.resources/redact-ui-credential`); the transport's HTML scrub does not reach tool results."
    (let [recorded (atom [])]
      (mt/with-dynamic-fn-redefs [ait/record! (fn [m] (swap! recorded conj m))]
        (let [{:keys [result]}
              (mt/with-current-user (mt/user->id :crowberto)
                (registry/call-tool #{"agent:query:run"}
                                    (mcp.session/create! (mt/user->id :crowberto) nil)
                                    "refresh_ui_credential"
                                    {}
                                    {:supports-mcp-ui? true}))]
          (testing "the caller still gets the credential"
            (is (some? (get-in result [:_meta :com.metabase/mcp-apps :credential]))))
          (testing "but the trace does not"
            (let [traced (keep :ai/tool-output @recorded)]
              (is (seq traced) "the tool output must actually be recorded, or this proves nothing")
              (is (not-any? #(get-in % [:_meta :com.metabase/mcp-apps]) traced)))))))))

(deftest ui-credential-is-not-a-general-session-test
  (testing "GHY-4400: the UI credential used to be stamped `::scope/unrestricted`, and then `::scope/mcp-ui`
            over a route allowlist that included `/api/user/current` — an inventory of what the embedded app
            happened to call rather than a decision about what the credential should reach. That made
            `refresh_ui_credential` a scope-escalation primitive: a token granted only `agent:query:run` is
            refused the profile, but the credential minted from it was served it.

            The credential now authenticates a purpose-built surface only. It still carries `::scope/mcp-ui`,
            which satisfies no endpoint's declared scope, and `:token-scopes-checked` is set only where the
            credential's signed scope claim covers the route — so anything off the surface, or on it without
            the scope, fails closed instead of arriving as the user."
    (mcp.ui-resource/with-fallback-template
      (let [session-id (initialize-ui-client!)
            credential (-> (mcp-request (jsonrpc-request "tools/call"
                                                         {:name "refresh_ui_credential" :arguments {}})
                                        {"mcp-session-id" session-id})
                           (get-in [:body :result :_meta :com.metabase/mcp-apps :credential]))
            headers    {"x-metabase-mcp-ui-auth" credential}]
        (is (some? credential) "the tool must hand back a credential, or this proves nothing")
        (testing "the profile the escalation exposed is no longer reachable"
          (is (= 401 (:status (client/client-full-response :get 401 "user/current"
                                                           {:request-options {:headers headers}})))))
        (testing "a route off the surface is refused, as before"
          (is (= 401 (:status (client/client-full-response :get 401 "collection"
                                                           {:request-options {:headers headers}})))))
        (testing "and the iframe still boots, on the endpoint built for it"
          (is (= 200 (:status (client/client-full-response
                               :get 200 "embed-mcp/bootstrap"
                               {:request-options {:headers (assoc headers "mcp-session-id" session-id)}})))))
        (testing "the request it authenticates is stamped `::scope/mcp-ui`, never unrestricted"
          (let [info (#'mw.session/current-user-info-for-mcp-ui-credential
                      {:request-method :get
                       :uri            "/api/embed-mcp/bootstrap"
                       :headers        {"x-metabase-mcp-ui-auth" credential}})]
            (is (= #{:metabase.api.macros.scope/mcp-ui} (:token-scopes info))
                "a credential must not carry the unrestricted sentinel")
            (is (true? (:token-scopes-checked info))
                "the stamp must be non-nil AND checked, or `ensure-scopes-checked` refuses the iframe")))
        (testing "a route the credential's scope claim does not cover is authenticated but not scope-checked"
          (is (false? (:token-scopes-checked
                       (#'mw.session/current-user-info-for-mcp-ui-credential
                        {:request-method :post
                         :uri            "/api/dataset"
                         :headers        {"x-metabase-mcp-ui-auth"
                                          (mcp.session/issue-ui-credential
                                           session-id (mt/user->id :crowberto) #{"agent:search"})}})))))))))

(deftest unauthenticated-discovery-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (testing "an unauthenticated request advertises the protected-resource metadata for the path it hit"
      (let [response (client/client-full-response :post 401 endpoint
                                                  {:request-options {:headers {}}}
                                                  (jsonrpc-request "initialize"))]
        (is (= 401 (:status response)))
        (is (str/includes? (get-in response [:headers "WWW-Authenticate"] "")
                           "/.well-known/oauth-protected-resource/api/metabase-mcp"))))
    (testing "GHY-4543: the challenge asks for the baseline, not everything the surface accepts. ChatGPT takes its
              login scope from this parameter; every tool is still listed, and a call needing more is answered with
              a 403 `insufficient_scope` step-up. The baseline includes agent:query:run, so charts never step up."
      (doseq [path ["metabase-mcp" "mcp"]]
        (testing path
          (let [response (client/client-full-response :post 401 path
                                                      {:request-options {:headers {}}}
                                                      (jsonrpc-request "initialize"))]
            (is (str/ends-with? (get-in response [:headers "WWW-Authenticate"] "")
                                ", scope=\"agent:content:read agent:query:run agent:resource:read\""))))))
    (testing "GHY-4543: an invalid bearer token's challenge asks for the same baseline"
      (doseq [path ["metabase-mcp" "mcp"]]
        (testing path
          (let [response (client/client-full-response :post 401 path
                                                      {:request-options
                                                       {:headers {"authorization" "Bearer totally-bogus-token"}}}
                                                      (jsonrpc-request "initialize"))]
            (is (= (str "Bearer realm=\"mcp\", "
                        "resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/api/" path "\", "
                        "scope=\"agent:content:read agent:query:run agent:resource:read\", "
                        "error=\"invalid_token\"")
                   (get-in response [:headers "WWW-Authenticate"])))))))
    (testing "auth-params are comma-delimited per RFC 7235, the form every spec and vendor example
              uses and the only one a strict parser accepts"
      (let [response (client/client-full-response :post 401 endpoint
                                                  {:request-options {:headers {}}}
                                                  (jsonrpc-request "initialize"))]
        (is (= (str "Bearer realm=\"mcp\", "
                    "resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource"
                    "/api/metabase-mcp\", "
                    "scope=\"agent:content:read agent:query:run agent:resource:read\"")
               (get-in response [:headers "WWW-Authenticate"])))))))

;;; ------------------------------------------------ Auth methods --------------------------------------------------

(deftest sso-provisioned-session-dispatches-test
  (testing "GHY-4287: the embedding integration path — a customer's backend signs a JWT per end user, exchanges
            it for a Metabase session at `/auth/sso`, and drives MCP with that session — must dispatch as that
            end user. An SSO login mints its session through `create-session-with-auth-tracking!`, which links
            it to the user's `auth_identity` row; the session middleware reports that row's provider as the
            auth method, and the v2 transport's session branch must accept it like any cookie session. (This
            slice refuses no auth method by kind; the test pins the SSO path so a later refusal keyed on auth
            method cannot silently catch it.)

            The customer's provider is JWT, but every provider mints its session through that one fn, and only
            OSS providers derive `::provider/provider` in an OSS run — so this uses OIDC to hold the guarantee in
            both editions rather than only where JWT SSO exists."
    (mt/with-temp [:model/User user {}
                   :model/AuthIdentity _sso-identity {:user_id (:id user) :provider "oidc"}]
      (let [session (auth-identity/create-session-with-auth-tracking! user nil :provider/oidc)]
        (testing "the session really is auth-identity-linked — otherwise this degrades into a plain-session test"
          (is (some? (:auth_identity_id session))))
        (testing "the user is one the seat count bills, unlike the `:type :api-key` user an API key authenticates as"
          (is (= :personal (t2/select-one-fn :type :model/User (:id user)))))
        (let [session-key (:key session)
              init        (client/client-full-response session-key :post 200 endpoint
                                                       {:request-options {:headers {}}}
                                                       (jsonrpc-request "initialize" {:capabilities {}}))
              session-id  (get-in init [:headers "Mcp-Session-Id"])]
          (testing "initialize is served, not met with the API-key refusal"
            (is (= 200 (:status init)))
            (is (some? session-id)))
          (testing "and a tool actually dispatches — the SSO session reaches the surface, not just the handshake"
            (let [response (client/client-full-response session-key :post 200 endpoint
                                                        {:request-options {:headers {"mcp-session-id" session-id}}}
                                                        (jsonrpc-request "tools/call" {:name "test_echo" :arguments {}}))
                  result   (get-in response [:body :result])]
              (is (not (:isError result)))
              (is (= {:ok true :message "pong"} (:structuredContent result))))))))))

(defn- do-with-temp-tool!
  "Register a throwaway tool for the body, then restore the registry. Lets a test assert scope filtering against a
  tool whose scope differs from the token's without depending on a not-yet-landed real tool."
  [tool thunk]
  (let [tools-atom @#'registry/tools*
        snapshot   @tools-atom]
    (try
      (registry/register-tool! tool)
      (thunk)
      (finally
        (reset! tools-atom snapshot)
        ;; register-tool! flushes the manifest cache; do the same on the way out so a later test doesn't see
        ;; a manifest that still lists the throwaway tool.
        (reset! @#'registry/manifest-cache nil)))))

(defn- do-with-bearer-token!
  "Issue an OAuth access token carrying `scopes` for crowberto and call `f` with the auth headers."
  [scopes f]
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (oauth-server.tu/with-oauth-client [client-id]
      (mt/with-model-cleanup [:model/OAuthAccessToken]
        (let [token (str (random-uuid))]
          ;; `:token` is stored hashed — the resolver hashes the presented string before looking it
          ;; up, so the row has to be written the same way a real issued token would be — including a
          ;; live `oauth_client` row, since the resolver fails closed on a token whose client is gone.
          (t2/insert! :model/OAuthAccessToken
                      {:token     (oidc.util/hash-token token)
                       :user_id   (mt/user->id :crowberto)
                       :client_id client-id
                       :scope     (vec scopes)
                       :expiry    (+ (System/currentTimeMillis) 3600000)})
          (f {"authorization" (str "Bearer " token)}))))))

(defn- embedded-credential
  "The UI credential the fallback template embedded in shell `html`, or nil when it embedded none."
  [html]
  (second (re-find #"uiCredential:\s*\"([^\"]+)\"" html)))

(defn- ui-credential-for
  "Drive the full MCP Apps handshake as a client holding `scopes`: initialize, read the
  visualize-query shell, and pull the credential back out of the rendered HTML — the same path a
  host's iframe bootstrap takes."
  [headers]
  (let [session-id (-> (client/client-full-response :post 200 endpoint
                                                    {:request-options {:headers headers}}
                                                    (jsonrpc-request "initialize" {:capabilities {}}))
                       (get-in [:headers "Mcp-Session-Id"]))
        html       (-> (client/client-full-response
                        :post 200 endpoint
                        {:request-options {:headers (assoc headers "mcp-session-id" session-id)}}
                        (jsonrpc-request "resources/read" {:uri v2.resources/visualize-query-uri}))
                       (get-in [:body :result :contents])
                       first
                       :text)]
    (embedded-credential html)))

(deftest ui-credential-cannot-outrun-its-scopes-test
  (testing "GHY-4318: the iframe credential is delivered to the CLIENT (by `refresh_ui_credential`; here, by the
            fallback template's shell HTML), so a client holding only `agent:query:run` can POST it straight to
            /api/dataset. The credential carries the token's own scopes, and the UI surface charges the whole
            /api/dataset tree a single `agent:query:run`, so the only thing standing between it and raw SQL is
            `check-mcp-ui-native-query!` — which must actually be wired into the query endpoints, not just
            unit-tested. Without the wiring, `agent:query:run` silently becomes `agent:sql:run`."
    (mcp.ui-resource/with-fallback-template
      ;; Both payloads are hand-rolled legacy MBQL rather than built with Lib, deliberately and
      ;; symmetrically: what is under test is the shape a client actually PUTs on the wire reaching the
      ;; guard, so constructing it through Lib would test Lib's output instead of the client's.
      (let [native-query {:database (mt/id) :type "native" :native {:query "SELECT 1"}}
            mbql-query   {:database (mt/id) :type "query" :query {:source-table (mt/id :venues) :limit 1}}]
        (testing "a client without agent:sql:run is refused, and told which scope it needs"
          (do-with-bearer-token!
           #{"agent:query:run"}
           (fn [headers]
             (let [credential (ui-credential-for headers)]
               (is (string? credential)
                   "the shell must render a credential — otherwise this test passes vacuously")
               (let [response (client/client-full-response
                               :post 403 "dataset"
                               {:request-options {:headers {"x-metabase-mcp-ui-auth" credential}}}
                               native-query)]
                 (is (re-find #"agent:sql:run" (str (:body response)))))))))
        (testing "the same client's non-native queries are untouched — the gate is on raw SQL, not on the credential"
          (do-with-bearer-token!
           #{"agent:query:run"}
           (fn [headers]
             (let [credential (ui-credential-for headers)]
               (is (= 202 (:status (client/client-full-response
                                    :post 202 "dataset"
                                    {:request-options {:headers {"x-metabase-mcp-ui-auth" credential}}}
                                    mbql-query))))))))
        (testing "a client that WAS granted agent:sql:run runs the same native query"
          (do-with-bearer-token!
           #{"agent:query:run" "agent:sql:run"}
           (fn [headers]
             (let [credential (ui-credential-for headers)]
               (is (= 202 (:status (client/client-full-response
                                    :post 202 "dataset"
                                    {:request-options {:headers {"x-metabase-mcp-ui-auth" credential}}}
                                    native-query))))))))))))

(deftest bearer-token-dispatches-with-its-own-scopes-test
  (testing "GHY-4287: the session middleware resolves an OAuth bearer token itself, so a bearer request reaches the
            transport on the same authenticated branch a cookie session does. It must still dispatch with the
            token's granted scopes — the unrestricted fallback that branch gives a cookie session would hand a
            narrow token every tool."
    ;; Register a throwaway tool on a DIFFERENT scope (`agent:content:write`, which the token below does not carry)
    ;; so the negative half of the scope contract has teeth independent of which real write tools are registered:
    ;; this test fails if the bearer request dispatches unrestricted.
    (do-with-temp-tool!
     {:name        "scope_probe_write"
      :scope       metabot.scope/agent-content-write
      :description "test-only tool gated on a write scope the narrow token lacks"
      :annotations {:readOnlyHint false}
      :args        [:map]
      :handler     (fn [_ _] nil)}
     (fn []
       (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
         (oauth-server.tu/with-oauth-client [client-id]
           (mt/with-model-cleanup [:model/OAuthAccessToken]
             (let [token   (str (random-uuid))
                   headers {"authorization" (str "Bearer " token)}]
               ;; `:token` is stored hashed — the resolver hashes the presented string before looking it
               ;; up, so the row has to be written the same way a real issued token would be — including a
               ;; live `oauth_client` row, since the resolver fails closed on a token whose client is gone.
               (t2/insert! :model/OAuthAccessToken
                           {:token     (oidc.util/hash-token token)
                            :user_id   (mt/user->id :crowberto)
                            :client_id client-id
                            :scope     ["agent:content:read"]
                            :expiry    (+ (System/currentTimeMillis) 3600000)})
               (let [session-id (-> (client/client-full-response :post 200 endpoint
                                                                 {:request-options {:headers headers}}
                                                                 (jsonrpc-request "initialize" {:capabilities {}}))
                                    (get-in [:headers "Mcp-Session-Id"]))
                     session!   (fn [body]
                                  (client/client-full-response
                                   :post 200 endpoint
                                   {:request-options {:headers (assoc headers "mcp-session-id" session-id)}}
                                   body))
                     call!      (fn [tool-name]
                                  (session! (jsonrpc-request "tools/call" {:name tool-name :arguments {}})))
                     tool-names (-> (session! (jsonrpc-request "tools/list"))
                                    (get-in [:body :result :tools])
                                    (->> (map :name) set))]
                 (is (some? session-id))
                 (testing "GHY-4543: tools/list lists tools on both sides of the token's scopes"
                   (is (contains? tool-names "test_echo"))
                   (is (contains? tool-names "scope_probe_write")
                       "a client can only step up for a tool it can see"))
                 (testing "a tool inside the granted scope (agent:content:read) is served"
                   (is (not (get-in (call! "test_echo") [:body :result :isError]))))
                 (testing "a tool gated on a scope the token lacks (agent:content:write) is refused at call time"
                   (let [response (client/client-full-response
                                   :post 403 endpoint
                                   {:request-options {:headers (assoc headers "mcp-session-id" session-id)}}
                                   (jsonrpc-request "tools/call" {:name "scope_probe_write" :arguments {}}))]
                     (is (str/starts-with? (get-in response [:body :error :message])
                                           "Insufficient scope to call tool: scope_probe_write.")))))))))))))

;;; ------------------------------------------- Insufficient-scope step-up -----------------------------------------

(deftest ^:parallel step-up-scopes-test
  (let [step-up-scopes #'v2.api/step-up-scopes
        surface        ["s:a" "s:b" "s:c" "s:d"]]
    (testing "GHY-4543: the challenge asks for the surface scopes the token holds plus the required one, in surface
              order, so a client that replaces its scope with the challenged one keeps what it had"
      (is (= ["s:a" "s:c" "s:d"] (step-up-scopes surface #{"s:d" "s:a"} "s:c"))))
    (testing "held scopes outside the surface, and the unrestricted sentinel, are not echoed back"
      (is (= ["s:b"] (step-up-scopes surface #{"agent:question:create" :metabase.api.macros.scope/unrestricted}
                                     "s:b"))))
    (testing "a required scope the token already holds is not repeated"
      (is (= ["s:a" "s:b"] (step-up-scopes surface #{"s:a" "s:b"} "s:b"))))
    (testing "a required scope outside the surface still reaches the challenge, after the surface scopes"
      (is (= ["s:a" "x:y"] (step-up-scopes surface #{"s:a"} "x:y"))))
    (testing "no token scopes at all yields just the required one"
      (is (= ["s:c"] (step-up-scopes surface nil "s:c"))))
    (testing "GHY-4543: a held wildcard keeps every surface scope it covers, though none is held literally, so a client
              that replaces its grant with the challenged scope loses no coverage"
      (is (= ["agent:content:read" "agent:content:write" "agent:sql:run"]
             (step-up-scopes ["agent:content:read" "agent:content:write" "agent:query:run" "agent:sql:run"]
                             #{"agent:content:*"}
                             "agent:sql:run")))
      (testing "and a bare `*` covers the whole surface"
        (is (= surface (step-up-scopes surface #{"*"} "s:b")))))))

(defn- bearer-session-post!
  "Handshake with bearer `headers` and return a fn `(post! expected-status body & {:keys [path extra-headers]})` that
  POSTs within that session."
  [headers]
  (let [session-id (-> (client/client-full-response :post 200 endpoint
                                                    {:request-options {:headers headers}}
                                                    (jsonrpc-request "initialize" {:capabilities {}}))
                       (get-in [:headers "Mcp-Session-Id"]))]
    (fn [expected-status body & {:keys [path extra-headers] :or {path endpoint}}]
      (client/client-full-response :post expected-status path
                                   {:request-options {:headers (merge headers
                                                                      {"mcp-session-id" session-id}
                                                                      extra-headers)}}
                                   body))))

(def ^:private metadata-url
  "http://localhost:3000/.well-known/oauth-protected-resource")

(deftest scope-denial-is-a-403-insufficient-scope-challenge-test
  (testing "GHY-4543: a scope denial must be a real HTTP 403 carrying an `insufficient_scope` WWW-Authenticate
            challenge (MCP authorization spec, runtime insufficient scope). Claude Code only records a step-up
            scope, and mcp-remote only starts a step-up, on that response; an in-body error over HTTP 200 does
            neither."
    (do-with-bearer-token!
     #{"agent:content:read" "agent:question:create"}
     (fn [headers]
       (let [post! (bearer-session-post! headers)
             denied (jsonrpc-request "tools/call" {:name "execute_sql" :arguments {}})]
         (testing "a registry-gated tool the token lacks the scope for"
           (let [response (post! 403 denied)]
             (is (= 403 (:status response)))
             (is (= (str "Bearer error=\"insufficient_scope\", "
                         "scope=\"agent:content:read agent:sql:run\", "
                         "resource_metadata=\"" metadata-url "/api/metabase-mcp\", "
                         "error_description=\"execute_sql requires agent:sql:run "
                         "(" (registry/english-scope-label "agent:sql:run") ")\"")
                    (get-in response [:headers "WWW-Authenticate"]))
                 "scope is the held v2 scopes plus the required one; the legacy non-v2 scope is not echoed")
             (testing "the body is still the JSON-RPC error, for clients that read it"
               (is (= "application/json" (get-in response [:headers "Content-Type"])))
               (is (= #{:jsonrpc :id :error} (set (keys (:body response))))
                   "no transport-internal marker leaks into the body")
               (is (= 1 (get-in response [:body :id])))
               (is (= -32600 (get-in response [:body :error :code])))
               (is (str/starts-with? (get-in response [:body :error :message])
                                     "Insufficient scope to call tool: execute_sql.")))))
         (testing "resource_metadata names the alias the client connected through, as the 401 challenge does"
           (is (str/includes? (get-in (post! 403 denied :path "mcp") [:headers "WWW-Authenticate"] "")
                              (str "resource_metadata=\"" metadata-url "/api/mcp\""))))
         (testing "a client that accepts SSE gets the same 403 challenge"
           (let [response (post! 403 denied :extra-headers {"accept" "application/json, text/event-stream"})]
             (is (= 403 (:status response)))
             (is (str/includes? (get-in response [:headers "WWW-Authenticate"] "") "error=\"insufficient_scope\""))))
         (testing "an allowed call is still a plain 200"
           (let [response (post! 200 (jsonrpc-request "tools/call" {:name "test_echo" :arguments {}}))]
             (is (= 200 (:status response)))
             (is (nil? (get-in response [:headers "WWW-Authenticate"])))
             (is (= {:ok true :message "pong"} (get-in response [:body :result :structuredContent])))))
         (testing "a denied call sent as a notification gets no reply, so it is a bare 202 with no challenge"
           (let [response (post! 202 (dissoc denied :id))]
             (is (= 202 (:status response)))
             (is (nil? (get-in response [:headers "WWW-Authenticate"])))))
         (testing "a batch keeps HTTP 200 with the denial in band, since one status cannot describe mixed results"
           (doseq [[label batch] {"denied call and a ping"     [denied (assoc (jsonrpc-request "ping") :id 2)]
                                  "a batch of one denied call" [denied]}]
             (testing label
               (let [response (post! 200 batch)]
                 (is (= 200 (:status response)))
                 (is (nil? (get-in response [:headers "WWW-Authenticate"])))
                 (is (sequential? (:body response)))
                 (is (= -32600 (:code (:error (first (filter #(= 1 (:id %)) (:body response)))))))
                 (is (every? #(= #{:jsonrpc :id} (disj (set (keys %)) :error :result)) (:body response))
                     "no transport-internal marker leaks into a batch element"))))))))))

(deftest in-handler-scope-denial-is-a-403-insufficient-scope-challenge-test
  (testing "GHY-4543: the scope checks inside tool handlers (here alert_write's deferred agent:query:run check) answer
            with the same 403 challenge as the registry gate, naming their own required scope"
    (mt/with-temp [:model/Card {card-id :id} {}]
      (do-with-bearer-token!
       #{"agent:content:read" "agent:delivery:write"}
       (fn [headers]
         (let [post!    (bearer-session-post! headers)
               response (post! 403 (jsonrpc-request "tools/call"
                                                    {:name      "alert_write"
                                                     :arguments {:method   "create"
                                                                 :card_id  card-id
                                                                 :schedule {:schedule_type "daily" :schedule_hour 9}}}))]
           (is (= 403 (:status response)))
           (is (= (str "Bearer error=\"insufficient_scope\", "
                       "scope=\"agent:content:read agent:query:run agent:delivery:write\", "
                       "resource_metadata=\"" metadata-url "/api/metabase-mcp\", "
                       "error_description=\"alert_write requires agent:query:run "
                       "(" (registry/english-scope-label "agent:query:run") ")\"")
                  (get-in response [:headers "WWW-Authenticate"])))
           (is (= -32600 (get-in response [:body :error :code])))
           (is (re-find #"requires the agent:query:run scope" (get-in response [:body :error :message])))
           (is (zero? (t2/count :model/NotificationCard :card_id card-id))
               "and nothing was created")))))))

(deftest baseline-token-steps-up-from-a-write-tool-test
  (testing "GHY-4543: a client that connected with only the advertised baseline is challenged, on a write, for the
            baseline plus the scope that write needs, so its step-up keeps what it already holds"
    (do-with-bearer-token!
     (set mcp.paths/v2-baseline-scopes)
     (fn [headers]
       (let [post!    (bearer-session-post! headers)
             response (post! 403 (jsonrpc-request "tools/call"
                                                  {:name      "collection_write"
                                                   :arguments {:method "create" :name "Step-up probe"}}))]
         (is (str/starts-with? (get-in response [:headers "WWW-Authenticate"] "")
                               (str "Bearer error=\"insufficient_scope\", "
                                    "scope=\"agent:content:read agent:content:write agent:query:run "
                                    "agent:resource:read\", "
                                    "resource_metadata=\"" metadata-url "/api/metabase-mcp\", "))))))))

(defn- orders-query
  "A portable MBQL 5 query over the test data Orders table."
  []
  (let [table (t2/select-one :model/Table (mt/id :orders))]
    {:lib/type "mbql/query"
     :stages   [{:lib/type     "mbql.stage/mbql"
                 :source-table [(:name (mt/db)) (:schema table) (:name table)]
                 :limit        1}]}))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest baseline-token-runs-queries-without-stepping-up-test
  (testing "GHY-4543: Claude Desktop retries a tool after step-up over a session that does not declare MCP Apps, so the
            first chart after a step-up could never embed. The baseline therefore carries agent:query:run: a freshly
            connected client queries and charts without a 403."
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (do-with-bearer-token!
       (set mcp.paths/v2-baseline-scopes)
       (fn [headers]
         (let [session-id (-> (client/client-full-response :post 200 endpoint
                                                           {:request-options {:headers headers}}
                                                           (jsonrpc-request "initialize" mcp-app-ui-capabilities))
                              (get-in [:headers "Mcp-Session-Id"]))
               call!      (fn [expected-status tool-name arguments]
                            (client/client-full-response
                             :post expected-status endpoint
                             {:request-options {:headers (assoc headers "mcp-session-id" session-id)}}
                             (jsonrpc-request "tools/call" {:name tool-name :arguments arguments})))]
           (doseq [[tool-name arguments] [["execute_query" {:query (orders-query)}]
                                          ["visualize_query" {:query (orders-query)}]
                                          ["refresh_ui_credential" {}]]]
             (testing tool-name
               (let [response (call! 200 tool-name arguments)]
                 (is (nil? (get-in response [:headers "WWW-Authenticate"])))
                 (is (nil? (get-in response [:body :error])))
                 (is (false? (boolean (get-in response [:body :result :isError])))
                     (pr-str (get-in response [:body :result]))))))
           (testing "raw SQL still steps up, naming agent:sql:run on top of the baseline"
             (let [response (call! 403 "execute_sql" {})]
               (is (= (str "Bearer error=\"insufficient_scope\", "
                           "scope=\"agent:content:read agent:query:run agent:sql:run agent:resource:read\", "
                           "resource_metadata=\"" metadata-url "/api/metabase-mcp\", "
                           "error_description=\"execute_sql requires agent:sql:run "
                           "(" (registry/english-scope-label "agent:sql:run") ")\"")
                      (get-in response [:headers "WWW-Authenticate"])))))))))))

(deftest data-resource-read-without-its-scope-is-a-403-insufficient-scope-challenge-test
  (testing "GHY-4543: a data resource read the token lacks the scope for answers with the same 403 challenge as
            `tools/call`, so a client learns which scope to step up to. Driven over a bearer token because a cookie
            session is unrestricted and never exercises scopes at all."
    (mcp.ui-resource/with-fallback-template
      (do-with-bearer-token!
       #{"agent:content:read"}
       (fn [headers]
         (let [post!   (bearer-session-post! headers)
               read-of (fn [uri] (jsonrpc-request "resources/read" {:uri uri}))
               denied  (read-of v2.resources/fields-catalog-uri)]
           (testing "the fields catalog without agent:resource:read"
             (let [response (post! 403 denied)]
               (is (= 403 (:status response)))
               (is (= (str "Bearer error=\"insufficient_scope\", "
                           "scope=\"agent:content:read agent:resource:read\", "
                           "resource_metadata=\"" metadata-url "/api/metabase-mcp\", "
                           "error_description=\"catalog://metabase/fields requires agent:resource:read "
                           "(" (registry/english-scope-label "agent:resource:read") ")\"")
                      (get-in response [:headers "WWW-Authenticate"])))
               (testing "the body is the JSON-RPC error, with no transport-internal marker"
                 (is (= #{:jsonrpc :id :error} (set (keys (:body response)))))
                 (is (= {:code    -32600
                         :message (str "Insufficient scope to read resource: catalog://metabase/fields. "
                                       "Requires agent:resource:read; your token holds agent:content:read.")}
                        (get-in response [:body :error]))))))
           (testing "resource_metadata names the alias the client connected through"
             (is (str/includes? (get-in (post! 403 denied :path "mcp") [:headers "WWW-Authenticate"] "")
                                (str "resource_metadata=\"" metadata-url "/api/mcp\""))))
           (testing "an unknown URI is still not found over 200, with no challenge"
             (let [response (post! 200 (read-of "ui://metabase/does-not-exist.html"))]
               (is (nil? (get-in response [:headers "WWW-Authenticate"])))
               (is (= {:code -32602 :message "Resource not found"} (get-in response [:body :error])))))
           (testing "a batch keeps HTTP 200 with the denial in band"
             (doseq [[label batch] {"denied read and a ping"     [denied (assoc (jsonrpc-request "ping") :id 2)]
                                    "a batch of one denied read" [denied]}]
               (testing label
                 (let [response (post! 200 batch)]
                   (is (= 200 (:status response)))
                   (is (nil? (get-in response [:headers "WWW-Authenticate"])))
                   (is (= -32600 (:code (:error (first (filter #(= 1 (:id %)) (:body response)))))))
                   (is (every? #(= #{:jsonrpc :id} (disj (set (keys %)) :error :result)) (:body response))
                       "no transport-internal marker leaks into a batch element")))))))))))

(deftest baseline-token-reads-the-fields-catalog-test
  (testing "GHY-4543: the advertised baseline carries agent:resource:read, so a freshly connected client reads the
            fields catalog without stepping up"
    (do-with-bearer-token!
     (set mcp.paths/v2-baseline-scopes)
     (fn [headers]
       (let [response ((bearer-session-post! headers)
                       200
                       (jsonrpc-request "resources/read" {:uri v2.resources/fields-catalog-uri}))
             content  (first (get-in response [:body :result :contents]))]
         (is (nil? (get-in response [:headers "WWW-Authenticate"])))
         (is (nil? (get-in response [:body :error])))
         (is (= v2.resources/fields-catalog-uri (:uri content)))
         (is (map? (json/decode (:text content)))))))))

(deftest ui-shells-read-regardless-of-token-scopes-test
  (testing "GHY-4543: Claude Desktop reads an MCP Apps shell concurrently with the tool call, and a 403 on that read
            stopped it stepping up after the tool call's own 403. The shell carries no data and, for a token without
            its scope, no credential, so it is served to any token; the data stays gated by the tool call and
            `refresh_ui_credential`."
    (mcp.ui-resource/with-fallback-template
      (do-with-bearer-token!
       #{"agent:content:read"}
       (fn [headers]
         (let [post!   (bearer-session-post! headers)
               read-of (fn [uri] (jsonrpc-request "resources/read" {:uri uri}))]
           (testing "resources/list still shows every resource, including the one this token cannot read"
             (is (= #{v2.resources/visualize-query-uri v2.resources/render-drill-through-uri
                      v2.resources/fields-catalog-uri}
                    (set (map :uri (get-in (post! 200 (jsonrpc-request "resources/list"))
                                           [:body :result :resources]))))))
           (testing "each shell reads over 200 with no challenge, without agent:query:run"
             (doseq [uri [v2.resources/visualize-query-uri v2.resources/render-drill-through-uri]]
               (testing uri
                 (let [response (post! 200 (read-of uri))]
                   (is (nil? (get-in response [:headers "WWW-Authenticate"])))
                   (is (nil? (get-in response [:body :error])))
                   (is (= [uri] (map :uri (get-in response [:body :result :contents]))))))))
           (testing "a batch serves the shell in band as well"
             (let [response (post! 200 [(read-of v2.resources/visualize-query-uri)
                                        (assoc (jsonrpc-request "ping") :id 2)])
                   by-id    (into {} (map (juxt :id identity)) (:body response))]
               (is (nil? (get-in response [:headers "WWW-Authenticate"])))
               (is (nil? (get-in by-id [1 :error])))
               (is (= v2.resources/visualize-query-uri (-> by-id (get-in [1 :result :contents]) first :uri)))))))))))

(deftest shell-credential-is-minted-only-for-a-token-holding-the-shell-scope-test
  (testing "GHY-4543: a shell read no longer requires the shell's scope, so the UI credential must not come with it. The
            credential authenticates the iframe's /api/dataset surface; a token without agent:query:run must never
            get one from a shell read, even through a template that embeds whatever it is given."
    (mcp.ui-resource/with-fallback-template
      (let [minted     (atom 0)
            shell-text (fn [scopes]
                         ;; An atom because `do-with-bearer-token!` does not return `f`'s value.
                         (let [text (atom nil)]
                           (do-with-bearer-token!
                            scopes
                            (fn [headers]
                              (let [response ((bearer-session-post! headers)
                                              200
                                              (jsonrpc-request "resources/read" {:uri v2.resources/visualize-query-uri}))]
                                (is (nil? (get-in response [:headers "WWW-Authenticate"])))
                                (reset! text (-> response (get-in [:body :result :contents]) first :text)))))
                           @text))]
        ;; Delegation captures the original through `mt/original-fn`, as in
        ;; `credential-is-minted-only-where-it-is-embedded-test`.
        (mt/with-dynamic-fn-redefs [mcp.session/issue-ui-credential
                                    (fn [& args]
                                      (swap! minted inc)
                                      (apply (mt/original-fn #'mcp.session/issue-ui-credential) args))]
          (let [without-query-run (shell-text #{"agent:content:read" "agent:resource:read"})]
            (testing "a token without agent:query:run reads the shell, but the credential slot renders empty and none is
                      minted"
              (is (str/includes? without-query-run "metabaseConfig"))
              (is (re-find #"uiCredential:\s*\}" without-query-run))
              (is (nil? (embedded-credential without-query-run)))
              (is (zero? @minted)))
            (testing "a token without even agent:resource:read reads the shell too, and still mints none"
              (is (nil? (embedded-credential (shell-text #{"agent:content:read"}))))
              (is (zero? @minted)))
            (testing "a token holding every scope a read could need reads the fields catalog, and mints none: only
                      a shell embeds a credential"
              (do-with-bearer-token!
               #{"agent:content:read" "agent:query:run" "agent:resource:read"}
               (fn [headers]
                 (let [response ((bearer-session-post! headers)
                                 200
                                 (jsonrpc-request "resources/read" {:uri v2.resources/fields-catalog-uri}))]
                   (is (nil? (get-in response [:body :error])))
                   (is (= [v2.resources/fields-catalog-uri]
                          (map :uri (get-in response [:body :result :contents])))))))
              (is (zero? @minted)))
            (testing "a token holding agent:query:run still gets one embedded, minted once"
              (let [query-run (shell-text #{"agent:content:read" "agent:query:run"})]
                (is (string? (embedded-credential query-run)))
                (is (= 1 @minted))
                (testing "and the two shells differ in nothing but that credential"
                  (is (= without-query-run (str/replace query-run #"uiCredential:\s*\"[^\"]*\"" "uiCredential: "))))))))))))

(deftest refresh-ui-credential-without-query-run-is-a-403-challenge-test
  (testing "GHY-4543: with shell reads open to every token, `refresh_ui_credential` is how the iframe gets a credential.
            A capable client without agent:query:run is challenged for it, and handed nothing."
    (do-with-bearer-token!
     #{"agent:content:read" "agent:resource:read"}
     (fn [headers]
       (let [session-id (-> (client/client-full-response :post 200 endpoint
                                                         {:request-options {:headers headers}}
                                                         (jsonrpc-request "initialize" mcp-app-ui-capabilities))
                            (get-in [:headers "Mcp-Session-Id"]))
             response   (client/client-full-response
                         :post 403 endpoint
                         {:request-options {:headers (assoc headers "mcp-session-id" session-id)}}
                         (jsonrpc-request "tools/call" {:name "refresh_ui_credential" :arguments {}}))]
         (is (= 403 (:status response)))
         (is (str/starts-with? (get-in response [:headers "WWW-Authenticate"] "")
                               (str "Bearer error=\"insufficient_scope\", "
                                    "scope=\"agent:content:read agent:query:run agent:resource:read\", ")))
         (is (= #{:jsonrpc :id :error} (set (keys (:body response)))))
         (is (= -32600 (get-in response [:body :error :code]))))))))

(deftest unscoped-callers-never-get-an-insufficient-scope-challenge-test
  (testing "GHY-4543: a cookie session is stamped unrestricted, so a tool gated on any scope is served over 200"
    (do-with-temp-tool!
     {:name        "scope_probe_sql"
      :scope       metabot.scope/agent-sql-run
      :description "test-only tool gated on agent:sql:run"
      :annotations {:readOnlyHint true}
      :args        [:map]
      :handler     (fn [_ _] {:content [{:type "text" :text "served"}]})}
     (fn []
       (let [[session-id] (initialize!)
             response     (mcp-request (jsonrpc-request "tools/call" {:name "scope_probe_sql" :arguments {}})
                                       {"mcp-session-id" session-id})]
         (is (= 200 (:status response)))
         (is (nil? (get-in response [:headers "WWW-Authenticate"])))
         (is (= "served" (-> response :body :result :content first :text))))))))
