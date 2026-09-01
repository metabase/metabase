(ns metabase.mcp.transport-test
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.ai-tracing.core :as ait]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.transport :as mcp.transport]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.server.streaming-response.thread-pool :as thread-pool]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.json :as json]
   [oidc-provider.util :as oidc.util]
   [throttle.core :as throttle]
   [toucan2.core :as t2])
  (:import
   (java.io StringWriter Writer)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- signaling-writer!
  "A `Writer` that copies everything written to `sink` and then offers `::request-canceled` on `chan`. Cancelling at
  exactly the moment the stream writes a keepalive removes the timing dependency from the test below: the loop is
  cancelled at the instant it would otherwise start waiting out the keepalive interval."
  ^Writer [^StringWriter sink chan]
  (proxy [Writer] []
    (write
      ([data]
       (cond
         (string? data)  (.write sink ^String data)
         (integer? data) (.write sink (int data))
         :else           (.write sink ^chars data))
       (a/offer! chan ::request-canceled))
      ([data off len]
       (if (string? data)
         (.write sink ^String data (int off) (int len))
         (.write sink ^chars data (int off) (int len)))
       (a/offer! chan ::request-canceled)))
    (flush [])
    (close [])))

(defn- run-keepalive-loop!
  "Run the keepalive loop on a separate thread, returning `:returned` if it finished within 5s and `:timed-out` if
  it is still holding its thread."
  [writer tools-hash-fn canceled-chan interval-ms]
  (deref (future (#'mcp.transport/keepalive-loop! writer tools-hash-fn nil canceled-chan interval-ms)
                 :returned)
         5000
         :timed-out))

(deftest keepalive-loop-releases-its-thread-when-the-client-disconnects-test
  (testing (str "GHY-4331: a stream cancelled mid-interval releases its thread promptly instead of holding it until "
                "the next keepalive tick")
    (let [canceled (a/promise-chan)
          sink     (StringWriter.)]
      (is (= :returned (run-keepalive-loop! (signaling-writer! sink canceled) (constantly "hash") canceled 30000)))
      (testing "the keepalive written before the cancellation still reached the client"
        (is (= ": keepalive\n\n" (str sink)))))))

(deftest keepalive-loop-emits-tools-list-changed-on-hash-change-test
  (testing "a change in the visible tool set between ticks emits notifications/tools/list_changed exactly once"
    (let [canceled (a/promise-chan)
          sink     (StringWriter.)
          calls    (atom 0)
          hash-fn  (fn [_scopes]
                     (let [n (swap! calls inc)]
                       ;; cancel on the third read so the loop terminates after a known number of ticks
                       (when (>= n 3)
                         (a/offer! canceled ::request-canceled))
                       (if (= n 1) "hash-1" "hash-2")))]
      (is (= :returned (run-keepalive-loop! sink hash-fn canceled 1)))
      (let [output (str sink)]
        (is (= 3 (count (re-seq #": keepalive" output))))
        (is (= 1 (count (re-seq #"notifications/tools/list_changed" output))))))))

(deftest keepalive-stream-does-not-run-on-the-shared-streaming-pool-test
  (testing (str "GHY-4331: the GET keepalive blocks for the life of the client's connection, so it must not be "
                "submitted to the fixed streaming-response pool that also serves query downloads")
    (let [captured  (atom nil)
          real-fn   @#'streaming-response/-streaming-response
          responded (promise)]
      (with-redefs-fn {#'mcp.transport/require-valid-session    (fn [_user-id _session-id] {:session-id "session"})
                       #'streaming-response/-streaming-response (fn [f options]
                                                                  (reset! captured options)
                                                                  (real-fn f options))}
        (fn []
          (#'mcp.transport/handle-get (constantly "hash") 1 {:headers {"mcp-session-id" "session"}}
                                      #(deliver responded %) (fn [e] (throw e)))))
      (is (= 200 (:status (deref responded 5000 nil))))
      (let [executor (:executor @captured)]
        (is (some? executor)
            "the keepalive stream must name an executor rather than defaulting to the shared pool")
        (is (not= executor (thread-pool/thread-pool)))))))

;;; ------------------------------------------ Transport-level guards ----------------------------------------------
;;;
;;; GHY-4337. Everything below runs upstream of every per-tool permission test: if the transport lets a request
;;; through, no tool-level gate is ever consulted. The scenarios are ported from the deleted `metabase.mcp.api-test`,
;;; which covered them for the v1 surface.

;; During the v1→v2 migration the v2 surface is mounted only at `/v2`; the canonical path still
;; serves v1. The final switchover PR repoints this at "metabase-mcp".
(def ^:private endpoint "metabase-mcp/v2")

(defn- mcp-request
  "POST `body` to the MCP endpoint as `username` (default `:crowberto`), returning the full response."
  ([body]
   (mcp-request :crowberto body {}))
  ([body extra-headers]
   (mcp-request :crowberto body extra-headers))
  ([username body extra-headers]
   (client/client-full-response (test.users/username->token username)
                                :post endpoint
                                {:request-options {:headers extra-headers}}
                                body)))

(defn- jsonrpc-request
  ([method]           (jsonrpc-request method {} 1))
  ([method params]    (jsonrpc-request method params 1))
  ([method params id] {:jsonrpc "2.0" :method method :params params :id id}))

(defn- jsonrpc-notification [method]
  {:jsonrpc "2.0" :method method :params {}})

(defn- ping-call []
  (jsonrpc-request "tools/call" {:name "ping_v2" :arguments {}}))

(defn- initialize!
  "Run the `initialize` handshake as `username` and return the issued `Mcp-Session-Id`."
  ([]
   (initialize! :crowberto))
  ([username]
   (get-in (mcp-request username (jsonrpc-request "initialize") {}) [:headers "Mcp-Session-Id"])))

;;; ------------------------------------------------ Session guards ------------------------------------------------

(deftest forged-session-id-is-refused-test
  (testing "GHY-4337: a session id the server never issued must not reach method dispatch"
    (testing "a missing header is a 400 — the client never handshook"
      (let [response (mcp-request (jsonrpc-request "tools/list"))]
        (is (= 400 (:status response)))
        (is (= "Missing Mcp-Session-Id header" (get-in response [:body :error :message])))
        (is (nil? (get-in response [:body :result])))))
    (doseq [[label forged] {"not a uuid"                                    "bogus-session-id"
                            "a uuid with an undecodable capability payload" (str (random-uuid) ".!!!!")
                            "more segments than the format allows"          (str (random-uuid) ".e30.e30")}]
      (testing label
        (let [response (mcp-request (jsonrpc-request "tools/list") {"mcp-session-id" forged})]
          (is (= 404 (:status response)))
          (is (= "Invalid or expired session" (get-in response [:body :error :message])))
          (is (nil? (get-in response [:body :result]))))))))

(defn- fabricated-session-id
  "A structurally well-formed Mcp-Session-Id the server never issued: a random UUID plus a valid `{v,ui}` capability
  payload, constructed entirely client-side. `valid-id?` passes on it (the format is the only thing it checks)."
  []
  (str (random-uuid)
       "."
       (.encodeToString (.withoutPadding (java.util.Base64/getUrlEncoder))
                        (.getBytes ^String (json/encode {:v 1 :ui true}) "UTF-8"))))

(deftest well-formed-but-never-issued-session-id-is-accepted-for-its-presenter-test
  (testing (str "GHY-4337: MCP session ids are unsigned, stateless correlators — no server-side record of what was "
                "issued exists (see the `metabase.mcp.session` ns docstring), so the server cannot tell an id it "
                "minted from a well-formed one a client fabricated, and does not try to. Such an id is therefore "
                "ACCEPTED for the already-authenticated user presenting it. This is not a hole: authentication is "
                "the session cookie / bearer token, which is checked independently and upstream; the fabricated id "
                "only names a fresh correlator scoped to that same caller. The real boundary — a well-formed id that "
                "ANOTHER user has already materialized a `core_session` under — is enforced by the ownership check "
                "and covered by `session-belonging-to-another-user-is-refused-test`.")
    (let [fabricated (fabricated-session-id)]
      (is (true? (mcp.session/valid-id? fabricated))
          "the fabricated id is structurally valid — the ownership model, not format, is the boundary")
      (let [response (mcp-request (ping-call) {"mcp-session-id" fabricated})]
        (is (= 200 (:status response)))
        (is (= {:ok true :message "pong"} (get-in response [:body :result :structuredContent]))
            "an authenticated caller dispatches inside a correlator it fabricated, because no other user owns it")))))

(deftest session-belonging-to-another-user-is-refused-test
  (testing (str "GHY-4337: `Mcp-Session-Id` is client-supplied and unsigned, so once a session has materialized a "
                "`core_session` the ownership check is the only thing stopping another authenticated user from "
                "presenting it and dispatching inside it")
    (let [session-id (initialize! :rasta)
          rasta-id   (mt/user->id :rasta)]
      (try
        ;; there is no owner to violate until a `core_session` row exists, so materialize one the way a resource
        ;; read would
        (mcp.session/get-or-create-embedding-session! session-id rasta-id)
        (testing "its owner still dispatches"
          (let [response (mcp-request :rasta (ping-call) {"mcp-session-id" session-id})]
            (is (= 200 (:status response)))
            (is (= {:ok true :message "pong"} (get-in response [:body :result :structuredContent])))))
        (testing "another authenticated user gets the answer a nonexistent session gets, and no tool result"
          (let [response (mcp-request :crowberto (ping-call) {"mcp-session-id" session-id})]
            (is (= 404 (:status response)))
            (is (= "Invalid or expired session" (get-in response [:body :error :message])))
            (is (nil? (get-in response [:body :result])))))
        (testing "nor can they tear it down"
          (let [response (client/client-full-response (test.users/username->token :crowberto)
                                                      :delete endpoint
                                                      {:request-options {:headers {"mcp-session-id" session-id}}})]
            (is (= 404 (:status response))))
          ;; the `core_session` row is what carries the ownership, so a DELETE that reaped it would leave the
          ;; session ownerless — and an ownerless session dispatches for anyone
          (testing "the session is still owned afterwards, so the foreigner is still refused"
            (is (= 404 (:status (mcp-request :crowberto (ping-call) {"mcp-session-id" session-id})))))
          (testing "and its owner still holds it"
            (is (= 200 (:status (mcp-request :rasta (ping-call) {"mcp-session-id" session-id}))))))
        (finally
          (mcp.session/delete! session-id rasta-id))))))

;;; ----------------------------------------------- Origin validation ----------------------------------------------

(deftest origin-validation-test
  (testing (str "GHY-4337: DNS-rebinding protection (an MCP spec requirement) — a page on some other origin can "
                "reach a locally-bound server, so an `Origin` that is neither the request's own host nor an "
                "approved MCP app origin is refused")
    (let [response (mcp-request (jsonrpc-request "initialize")
                                {"host" "mbtest.poom.dev" "origin" "http://127.0.0.1:6274"})]
      (is (= 403 (:status response)))
      (is (= "Origin not allowed" (get-in response [:body :error :message])))
      (is (nil? (get-in response [:headers "Mcp-Session-Id"]))
          "a refused origin must not be handed a session")))
  (testing "the check runs ahead of authentication, so a cross-origin request is refused rather than challenged"
    (let [response (client/client-full-response :post 403 endpoint
                                                {:request-options {:headers {"host"   "mbtest.poom.dev"
                                                                             "origin" "http://evil.example.com"}}}
                                                (jsonrpc-request "initialize"))]
      (is (= 403 (:status response)))
      (is (nil? (get-in response [:headers "WWW-Authenticate"])))))
  (testing (str "GHY-4337: an origin differs from a host when it differs in ANY of scheme, domain, or port — so "
                "matching on the domain alone lets every other app on the same hostname through. That is the whole "
                "local-MCP threat model: a page served by some other tool on 127.0.0.1 driving this server with the "
                "user's cookies. `localhost` is one domain, not one origin.")
    (let [response (mcp-request (jsonrpc-request "initialize")
                                {"host" "localhost:3000" "origin" "http://localhost:9999"})]
      (is (= 403 (:status response)))
      (is (nil? (get-in response [:headers "Mcp-Session-Id"])))))
  (testing "the same host and the same explicit port is still same-origin — the port check must not reject the
            requests it is supposed to serve"
    (is (= 200 (:status (mcp-request (jsonrpc-request "initialize")
                                     {"host" "localhost:3000" "origin" "http://localhost:3000"})))))
  (testing (str "when only one side carries an explicit port the check falls back to the domain. A reverse proxy "
                "can rewrite `Host` to add or drop a port that the browser's `Origin` does not carry, and a 403 on "
                "a legitimate deployment is worse than the residual: an attacker exploiting this has to occupy the "
                "scheme's DEFAULT port locally, which non-default-port dev servers by definition do not.")
    (is (= 200 (:status (mcp-request (jsonrpc-request "initialize")
                                     {"host" "localhost:3000" "origin" "http://localhost"}))))
    (is (= 200 (:status (mcp-request (jsonrpc-request "initialize")
                                     {"host" "localhost" "origin" "http://localhost:3000"})))))
  (testing "a non-browser client sends no Origin at all and is allowed through — browsers are what the guard is for"
    (is (= 200 (:status (mcp-request (jsonrpc-request "initialize") {"host" "mbtest.poom.dev"})))))
  (testing "same-origin is allowed, including bracketed IPv6 and mixed case"
    (is (= 200 (:status (mcp-request (jsonrpc-request "initialize")
                                     {"host" "[::1]:3000" "origin" "http://[::1]:3000"}))))
    (is (= 200 (:status (mcp-request (jsonrpc-request "initialize")
                                     {"host" "Example.com" "origin" "https://example.COM"})))))
  (testing "an explicitly configured MCP app origin is allowed cross-host, case-insensitively"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins "https://Example.COM"]
      (let [response (mcp-request (jsonrpc-request "initialize")
                                  {"host" "mbtest.poom.dev" "origin" "HTTPS://example.com"})]
        (is (= 200 (:status response)))
        (is (some? (get-in response [:headers "Mcp-Session-Id"])))))))

;;; ------------------------------------------------ Bearer tokens -------------------------------------------------

(deftest invalid-bearer-token-returns-401-test
  (testing "GHY-4337: a bearer token the store does not know authenticates nothing, and says so in the RFC 6750 form
            a client can act on"
    ;; the token store lives on the OAuth provider, which only builds against a real site-url
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [response (client/client-full-response :post 401 endpoint
                                                  {:request-options
                                                   {:headers {"authorization" "Bearer totally-bogus-token"}}}
                                                  (jsonrpc-request "initialize"))]
        (is (= 401 (:status response)))
        (is (nil? (get-in response [:headers "Mcp-Session-Id"])))
        (is (str/includes? (get-in response [:headers "WWW-Authenticate"] "") "invalid_token"))))))

(deftest expired-bearer-token-returns-401-test
  (testing "GHY-4337: an access token past its expiry is refused. The row is still there and still names a real
            user, so the expiry check is the whole guard"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (mt/with-model-cleanup [:model/OAuthAccessToken]
        (let [token (str (random-uuid))]
          ;; `:token` is stored hashed — the resolver hashes the presented string before looking it up
          (t2/insert! :model/OAuthAccessToken
                      {:token     (oidc.util/hash-token token)
                       :user_id   (mt/user->id :crowberto)
                       :client_id (str (random-uuid))
                       :scope     ["agent:content:read"]
                       :expiry    (- (inst-ms (java.util.Date.)) 3600000)})
          (let [response (client/client-full-response :post 401 endpoint
                                                      {:request-options
                                                       {:headers {"authorization" (str "Bearer " token)}}}
                                                      (jsonrpc-request "initialize"))]
            (is (= 401 (:status response)))
            (is (nil? (get-in response [:headers "Mcp-Session-Id"])))
            (is (str/includes? (get-in response [:headers "WWW-Authenticate"] "") "invalid_token"))))))))

(defn- issue-bearer!
  "Insert an OAuth access token row for `user-id` and return the raw (unhashed) token to present. `:token` is stored
  hashed, so the row is written the way a real issued token would be. Call inside `with-model-cleanup`."
  [user-id]
  (let [token (str (random-uuid))]
    (t2/insert! :model/OAuthAccessToken
                {:token     (oidc.util/hash-token token)
                 :user_id   user-id
                 :client_id (str (random-uuid))
                 :scope     ["agent:content:read"]
                 :expiry    (+ (System/currentTimeMillis) 3600000)})
    token))

(deftest deactivated-user-bearer-token-is-refused-test
  (testing (str "GHY-4337 / round-1 4a: a bearer token that names a DEACTIVATED user must not authenticate. The "
                "session middleware's bearer bridge already refuses it — its user lookup filters on "
                "`user.is_active = true` and it maps scopes through the `oauth-token->token-scopes` trust hinge — so "
                "an active user's token reaches the transport already authenticated and a deactivated user's does "
                "not. The transport must NOT re-resolve the token on its own (that path skipped both the active "
                "check and the trust hinge, so a disabled user's token authenticated with raw scopes); it must "
                "return the RFC 6750 invalid_token 401 and dispatch nothing.")
    ;; `:trashbird` is a globally-committed, pre-seeded INACTIVE user, so it is visible to the handler thread and
    ;; needs no is_active toggling (a `with-temp` user, created in-test, is not reliably visible cross-thread to the
    ;; mock handler's request thread, which would 401 for the wrong reason). `:rasta` is the active control.
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (mt/with-model-cleanup [:model/OAuthAccessToken]
        (let [initialize (fn [expected-status token]
                           ;; `expected-status` is passed so the client asserts it rather than throwing on an
                           ;; "unexpected" 401 (which triggers its session re-auth path).
                           (client/client-full-response :post expected-status endpoint
                                                        {:request-options {:headers {"authorization" (str "Bearer " token)}}}
                                                        (jsonrpc-request "initialize" {:capabilities {}})))]
          (testing "control: an ACTIVE user's bearer token authenticates and gets a session"
            (let [response (initialize 200 (issue-bearer! (mt/user->id :rasta)))]
              (is (= 200 (:status response)))
              (is (some? (get-in response [:headers "Mcp-Session-Id"])))))
          (testing "a DEACTIVATED user's bearer token is refused — no session, invalid_token challenge"
            (let [response (initialize 401 (issue-bearer! (mt/user->id :trashbird)))]
              (is (= 401 (:status response)))
              (is (nil? (get-in response [:headers "Mcp-Session-Id"]))
                  "a deactivated user must not be handed a working MCP session")
              (is (str/includes? (get-in response [:headers "WWW-Authenticate"] "") "invalid_token")))))))))

;;; -------------------------------------------------- Throttling --------------------------------------------------

(deftest per-user-throttle-returns-429-test
  (testing (str "GHY-4337: MCP is auth-gated, so the residual risk is a compromised credential — which is still one "
                "user. The per-user throttler is what bounds its total throughput across every MCP surface")
    (let [session-id (initialize!)]
      ;; Redefine the throttler rather than sending 1000 requests: what is under test is that `check-throttle`
      ;; refuses on the throttler's terms and shapes the refusal as JSON-RPC, not what the production cap happens
      ;; to be. `initialize!` runs first so the handshake does not spend the single attempt.
      (with-redefs-fn {#'mcp.transport/mcp-throttler (throttle/make-throttler :user-id :attempts-threshold 1)}
        (fn []
          (is (= 200 (:status (mcp-request (jsonrpc-request "ping") {"mcp-session-id" session-id})))
              "the one allowed attempt is served")
          (let [response (mcp-request (jsonrpc-request "ping") {"mcp-session-id" session-id})]
            (is (= 429 (:status response)))
            (is (string? (get-in response [:headers "Retry-After"])))
            (is (= -32000 (get-in response [:body :error :code])))
            (is (str/starts-with? (get-in response [:body :error :message]) "Too many attempts!"))
            (is (nil? (get-in response [:body :result])))))))))

(deftest throttle-charges-per-jsonrpc-message-not-per-request-test
  (testing (str "GHY-4337: the per-minute cap counts JSON-RPC messages, not HTTP requests. A POST can carry a batch, "
                "so charging one attempt per request would let a single batch smuggle arbitrarily many messages past "
                "the cap. A batch of N must cost N attempts.")
    (let [session-id (initialize!)]
      ;; Threshold 3, so a single 4-message batch already exceeds it — proving the batch is charged per element, not
      ;; once. `initialize!` ran on the real throttler before the redef, so it doesn't spend an attempt here.
      (with-redefs-fn {#'mcp.transport/mcp-throttler (throttle/make-throttler :user-id :attempts-threshold 3)}
        (fn []
          (let [response (mcp-request [(jsonrpc-request "ping" {} 1)
                                       (jsonrpc-request "ping" {} 2)
                                       (jsonrpc-request "ping" {} 3)
                                       (jsonrpc-request "ping" {} 4)]
                                      {"mcp-session-id" session-id})]
            (is (= 429 (:status response))
                "a 4-message batch against a cap of 3 is refused — it was charged 4, not 1")
            (is (= -32000 (get-in response [:body :error :code])))
            (is (str/starts-with? (get-in response [:body :error :message]) "Too many attempts!"))))))
    (testing "a single message costs exactly one attempt, so a cap of 1 serves it and refuses the next"
      (let [session-id (initialize!)]
        (with-redefs-fn {#'mcp.transport/mcp-throttler (throttle/make-throttler :user-id :attempts-threshold 1)}
          (fn []
            (is (= 200 (:status (mcp-request (jsonrpc-request "ping") {"mcp-session-id" session-id})))
                "the one allowed message is served")
            (is (= 429 (:status (mcp-request (jsonrpc-request "ping") {"mcp-session-id" session-id})))
                "the second single-message request is refused")))))))

;;; ------------------------------------------ JSON-RPC framing / batches ------------------------------------------

(deftest jsonrpc-batch-test
  (let [session-id (initialize!)]
    (testing "GHY-4337: a batch dispatches every message in it and answers with an array"
      (let [response (mcp-request [(jsonrpc-request "ping" {} 1)
                                   (jsonrpc-request "tools/list" {} 2)]
                                  {"mcp-session-id" session-id})]
        (is (= 200 (:status response)))
        (is (sequential? (:body response)))
        (is (= #{1 2} (set (map :id (:body response)))))))
    (testing "a notification has no id and so gets no response — a batch answers only for the requests in it"
      (let [response (mcp-request [(jsonrpc-notification "notifications/initialized")
                                   (jsonrpc-request "ping" {} 7)]
                                  {"mcp-session-id" session-id})]
        (is (= 200 (:status response)))
        (is (= [7] (map :id (:body response))))))
    (testing "a message set that produces no responses at all is a 202 with an empty body, not an empty array"
      (doseq [[label body] {"a batch of notifications" [(jsonrpc-notification "notifications/initialized")]
                            "a lone notification"      (jsonrpc-notification "notifications/initialized")}]
        (testing label
          (let [response (mcp-request body {"mcp-session-id" session-id})]
            (is (= 202 (:status response)))
            (is (str/blank? (str (:body response))))))))
    (testing "MCP forbids batching initialize — it is what issues the session the rest of a batch needs"
      (let [response (mcp-request [(jsonrpc-request "initialize")] {"mcp-session-id" session-id})]
        (is (= 400 (:status response)))
        (is (= "initialize must not be batched" (get-in response [:body :error :message])))
        (is (nil? (get-in response [:headers "Mcp-Session-Id"])))))
    (testing "an empty batch is invalid per JSON-RPC 2.0"
      (let [response (mcp-request [] {"mcp-session-id" session-id})]
        (is (= 400 (:status response)))
        (is (= "Invalid request: empty batch" (get-in response [:body :error :message])))))
    (testing "GHY-4337: each batch element is validated on its own (JSON-RPC 2.0 §6) — a malformed element gets its
              own -32600 rather than being silently dropped by `keep`"
      (testing "a mix of one valid request and non-object elements answers for every element, not just the valid one"
        (let [response (mcp-request [(jsonrpc-request "ping" {} 1) 42 "garbage"]
                                    {"mcp-session-id" session-id})
              body     (:body response)]
          (is (= 200 (:status response)))
          (is (= 3 (count body))
              "sent three elements, so the array must carry three answers — the two malformed ones are not dropped")
          (let [valid (first (filter #(= 1 (:id %)) body))]
            (is (= {} (:result valid)) "the valid request still succeeds")
            (is (nil? (:error valid))))
          (let [invalids (remove #(= 1 (:id %)) body)]
            (is (= 2 (count invalids)))
            (is (every? #(= -32600 (get-in % [:error :code])) invalids)
                "each non-object element is Invalid Request")
            (is (every? #(nil? (:id %)) invalids)
                "a malformed element's id is null per JSON-RPC 2.0 §5"))))
      (testing "an all-invalid batch answers with an error per element — NOT a 202 that would falsely signal
                'all notifications accepted' for malformed input"
        (let [response (mcp-request [1 2 3] {"mcp-session-id" session-id})]
          (is (= 200 (:status response))
              "an all-invalid batch is answered, not 202-swallowed")
          (is (= 3 (count (:body response))))
          (is (every? #(= -32600 (get-in % [:error :code])) (:body response)))))
      (testing "an object missing a string `method` is Invalid Request (-32600), not method-not-found (-32601)"
        (testing "as a single message"
          (let [response (mcp-request {:jsonrpc "2.0" :id 5} {"mcp-session-id" session-id})]
            (is (= -32600 (get-in response [:body :error :code])))
            (is (= "Invalid request" (get-in response [:body :error :message]))
                "no trailing-space 'Method not found: ' — the message is never dispatched as a method")))
        (testing "inside a batch, alongside a valid request"
          (let [response (mcp-request [(jsonrpc-request "ping" {} 1) {:jsonrpc "2.0" :id 5}]
                                      {"mcp-session-id" session-id})
                body     (:body response)]
            (is (= 2 (count body)))
            (is (= -32600 (get-in (first (remove #(= 1 (:id %)) body)) [:error :code])))))))))

;;; ------------------------------------------------------ SSE -----------------------------------------------------

(deftest sse-post-response-test
  (testing "GHY-4337: a client that accepts text/event-stream gets its responses framed as SSE events"
    (let [session-id (initialize!)
          response   (mcp-request (jsonrpc-request "ping") {"mcp-session-id" session-id
                                                            "accept"         "text/event-stream"})]
      (is (= 200 (:status response)))
      (is (= "text/event-stream" (get-in response [:headers "Content-Type"])))
      (is (str/includes? (:body response) "event: message"))
      (is (str/includes? (:body response) "data: "))))
  (testing "initialize over SSE still issues the session in a header, which is where the client looks for it"
    (let [response (mcp-request (jsonrpc-request "initialize") {"accept" "text/event-stream"})
          data     (->> (str/split-lines (:body response))
                        (keep #(when (str/starts-with? % "data: ") (json/decode+kw (subs % 6))))
                        first)]
      (is (= 200 (:status response)))
      (is (= "text/event-stream" (get-in response [:headers "Content-Type"])))
      (is (some? (get-in response [:headers "Mcp-Session-Id"])))
      (is (= "2025-03-26" (get-in data [:result :protocolVersion])))))
  (testing "a client that does not ask for SSE keeps getting JSON"
    (let [session-id (initialize!)
          response   (mcp-request (jsonrpc-request "ping") {"mcp-session-id" session-id})]
      (is (= "application/json" (get-in response [:headers "Content-Type"])))
      (is (map? (:body response))))))

(deftest sse-get-stream-is-session-guarded-test
  (testing (str "GHY-4337: the GET keepalive stream holds a connection for as long as the client keeps it, so the "
                "session guard has to refuse before the stream opens rather than after")
    (testing "no session header"
      (let [response (client/client-full-response (test.users/username->token :crowberto) :get endpoint)]
        (is (= 400 (:status response)))
        (is (= "Missing Mcp-Session-Id header" (get-in response [:body :error :message])))))
    (testing "a session id the server never issued"
      (let [response (client/client-full-response (test.users/username->token :crowberto)
                                                  :get endpoint
                                                  {:request-options {:headers {"mcp-session-id" "bogus-session-id"}}})]
        (is (= 404 (:status response)))
        (is (= "Invalid or expired session" (get-in response [:body :error :message])))))))

;;; ---------------------------------------------- Eval session override -------------------------------------------

(deftest ^:parallel eval-session-override-test
  (testing "GHY-4337: the x-eval-session-id header names a trace file, so it is honored only when it is a safe name"
    (let [override #'mcp.transport/eval-session-override]
      (testing "a bare uuid (what the harness mints) is honored"
        (is (= "1ae768c9-5773-48dd-afca-c75780dae84c"
               (override {:headers {"x-eval-session-id" "1ae768c9-5773-48dd-afca-c75780dae84c"}}))))
      (testing "a safe slug is honored"
        (is (= "evalprobe_1.2" (override {:headers {"x-eval-session-id" "evalprobe_1.2"}}))))
      (testing "path traversal / unsafe chars are rejected, falling back to the Mcp-Session-Id correlator"
        (is (nil? (override {:headers {"x-eval-session-id" "../etc/passwd"}})))
        (is (nil? (override {:headers {"x-eval-session-id" "a/b"}})))
        (is (nil? (override {:headers {"x-eval-session-id" ".hidden"}}))))
      (testing "a value over max-session-id-length is rejected even though every char is safe"
        ;; one past the real cap — the boundary a looser copy of the contract would wrongly accept, and then 500 on
        ;; downstream in checked-session-id
        (is (= 200 ait/max-session-id-length))
        (is (nil? (override {:headers {"x-eval-session-id" (apply str (repeat 201 "a"))}})))
        (testing "the id exactly at the cap is honored, returned verbatim"
          (let [id (apply str (repeat 200 "a"))]
            (is (= id (override {:headers {"x-eval-session-id" id}}))))))
      (testing "absent header yields nil"
        (is (nil? (override {:headers {}})))))))
