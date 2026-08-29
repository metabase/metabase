(ns metabase-enterprise.mcp.usage-test
  "Tests for the three MCP usage write points (session at `initialize`, `ended_at` at
  teardown, tool-call per `tools/call`). Exercises the `defenterprise` dispatch via the OSS
  entry points in `metabase.mcp.usage`. Collection runs on every EE instance (`:feature
  :none`); PII is gated by `analytics-pii-retention-enabled` (itself `:audit-app`-gated)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.mcp.usage :as usage]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- cleanup! [session-id]
  (t2/delete! :model/McpSessionLog :id session-id))

(defn- cleanup-calls!
  "Tool-call rows no longer carry a session id, so tests isolate + clean up their rows by a unique
  column value (tool name / duration / client version). Whitelisted for `^:parallel` use."
  [& conditions]
  (apply t2/delete! :model/McpToolCallLog conditions))

;;; ----------------------------------------- detect-client (pure) ------------------------------------------

(deftest ^:parallel detect-client-test
  (testing "handshake clientInfo.name maps to a canonical client key"
    (is (= "claude"        (usage/detect-client "claude-ai")))
    (is (= "claude"        (usage/detect-client "Claude")))
    (is (= "chatgpt"       (usage/detect-client "ChatGPT")))
    (is (= "chatgpt"       (usage/detect-client "openai-mcp")))
    (is (= "cursor-vscode" (usage/detect-client "Cursor")))
    (is (= "vscode"        (usage/detect-client "Visual Studio Code")))
    (is (= "vscode"        (usage/detect-client "Visual Studio Code - Insiders")))
    (is (= "zed"           (usage/detect-client "Zed"))))
  (testing "the mcp-remote wrapper is stripped before classifying"
    (is (= "zed"    (usage/detect-client "Zed (via mcp-remote 0.1.37)")))
    (is (= "claude" (usage/detect-client "Claude Code (via mcp-remote 0.1.37)"))))
  (testing "the fuzzy fallback classifies spacing/punctuation variants and generic proxy wrappers"
    (is (= "vscode"  (usage/detect-client "VS Code")))
    (is (= "vscode"  (usage/detect-client "VSCode")))
    (is (= "chatgpt" (usage/detect-client "chat-gpt")))
    (is (= "chatgpt" (usage/detect-client "chatgpt-5 (via foo proxy v6)")))
    (is (= "claude"  (usage/detect-client "Claude (via some-other-proxy 1.0)"))))
  (testing "unknown / missing names fall back to \"other\""
    (is (= "other" (usage/detect-client "Some Random Client")))
    (is (= "other" (usage/detect-client "")))
    (is (= "other" (usage/detect-client nil))))
  (testing "every value produced is a supported key or the \"other\" fallback"
    (doseq [n ["claude-ai" "ChatGPT" "Cursor" "Visual Studio Code" "Zed" "whatever" nil]]
      (is (contains? (conj usage/supported-client-keys "other")
                     (usage/detect-client n))))))

(deftest ^:parallel proxy-probe?-test
  (testing "mcp-remote's throwaway transport-probe handshake is recognized (case-insensitive)"
    (is (true? (usage/proxy-probe? "mcp-remote-fallback-test")))
    (is (true? (usage/proxy-probe? "MCP-Remote-Fallback-Test"))))
  (testing "real clients (including mcp-remote-wrapped ones) are not probes"
    (is (not (usage/proxy-probe? "Zed (via mcp-remote 0.1.37)")))
    (is (not (usage/proxy-probe? "claude-ai")))
    (is (not (usage/proxy-probe? nil)))))

;;; ------------------------------------------- record-mcp-session! -----------------------------------------

(deftest record-mcp-session!-writes-row-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
      (let [sid (str "test-session-" (mt/random-name))]
        (try
          (usage/record-mcp-session!
           {:session-id     sid
            :user-id        (mt/user->id :rasta)
            :tenant-id      nil
            :client-info    {:name "claude-ai" :version "1.2.3"}
            :user-agent     "Mozilla/5.0 (Macintosh) Chrome/120"
            :ip-address     "203.0.113.7"})
          (let [row (t2/select-one :model/McpSessionLog :id sid)]
            (testing "non-PII identity columns"
              (is (= "claude" (:client_name row)))
              (is (= "1.2.3" (:client_version row)))
              (is (= (mt/user->id :rasta) (:user_id row))))
            (testing "PII columns are populated when retention is on"
              (is (= "203.0.113.7" (:ip_address row)))
              (is (some? (:user_agent row))))
            (testing "ended_at is not stamped at initialize"
              (is (nil? (:ended_at row)))))
          (finally (cleanup! sid)))))))

(deftest record-mcp-session!-pii-gate-off-test
  (testing "with retention off, PII columns are null but non-PII fields are kept"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
        (let [sid (str "test-session-" (mt/random-name))]
          (try
            (usage/record-mcp-session!
             {:session-id     sid
              :user-id        (mt/user->id :rasta)
              :tenant-id      7
              :client-info    {:name "chatgpt" :version "9"}
              :user-agent     "UA"
              :ip-address     "1.2.3.4"})
            (let [row (t2/select-one :model/McpSessionLog :id sid)]
              (is (= "chatgpt" (:client_name row)))
              (is (= (mt/user->id :rasta) (:user_id row)))
              (is (= 7 (:tenant_id row)))
              (testing "gated PII columns are null"
                (is (nil? (:ip_address row)))
                (is (nil? (:user_agent row)))))
            (finally (cleanup! sid))))))))

(deftest ^:parallel record-mcp-session!-identity-set-once-test
  (testing "a second initialize for the same session id never overwrites identity/PII"
    (mt/with-premium-features #{:audit-app}
      (let [sid (str "test-session-" (mt/random-name))]
        (try
          (usage/record-mcp-session!
           {:session-id sid :user-id (mt/user->id :rasta) :client-info {:name "claude-ai" :version "1"}})
          (usage/record-mcp-session!
           {:session-id sid :user-id (mt/user->id :crowberto) :client-info {:name "chatgpt" :version "2"}})
          (let [row (t2/select-one :model/McpSessionLog :id sid)]
            (is (= 1 (t2/count :model/McpSessionLog :id sid)))
            (is (= "claude" (:client_name row)))
            (is (= "1" (:client_version row)))
            (is (= (mt/user->id :rasta) (:user_id row))))
          (finally (cleanup! sid)))))))

(deftest ^:parallel record-mcp-session!-ignores-mcp-remote-probe-test
  (testing "mcp-remote's fallback-probe handshake is never recorded as a session"
    (mt/with-premium-features #{:audit-app}
      (let [sid (str "test-probe-" (mt/random-name))]
        (try
          (usage/record-mcp-session!
           {:session-id sid :user-id (mt/user->id :rasta)
            :client-info {:name "mcp-remote-fallback-test" :version "0.0.0"}})
          (is (nil? (t2/select-one :model/McpSessionLog :id sid)))
          (finally (cleanup! sid)))))))

;;; ----------------------------------------- record-mcp-session-end! ---------------------------------------

(deftest ^:parallel record-mcp-session-end!-stamps-ended-at-test
  (mt/with-premium-features #{:audit-app}
    (let [sid (str "test-session-" (mt/random-name))]
      (try
        (usage/record-mcp-session! {:session-id sid :user-id (mt/user->id :rasta) :client-info {:name "claude"}})
        (is (nil? (:ended_at (t2/select-one :model/McpSessionLog :id sid))))
        (usage/record-mcp-session-end! sid)
        (is (some? (:ended_at (t2/select-one :model/McpSessionLog :id sid))))
        (finally (cleanup! sid)))))
  (testing "stamping a missing session row is a harmless no-op (zero rows updated, no throw)"
    (mt/with-premium-features #{:audit-app}
      (is (= 0 (usage/record-mcp-session-end! (str "absent-" (mt/random-name))))))))

;;; ------------------------------------------ record-mcp-tool-call! ----------------------------------------

(deftest ^:parallel record-mcp-tool-call!-writes-row-test
  (mt/with-premium-features #{:audit-app}
    (let [sid  (str "test-session-" (mt/random-name))
          tool (str "query-" (mt/random-name))]
      (try
        (usage/record-mcp-session! {:session-id sid :user-id (mt/user->id :rasta) :client-info {:name "claude"}})
        (usage/record-mcp-tool-call! {:tool-name tool :user-id (mt/user->id :rasta)
                                      :session-id sid :status "success" :duration-ms 12})
        (let [row (t2/select-one :model/McpToolCallLog :tool_name tool)]
          (is (= tool (:tool_name row)))
          (is (= "success" (:status row)))
          (is (= 12 (:duration_ms row)))
          (is (= (mt/user->id :rasta) (:user_id row)))
          (testing "client identity is denormalized onto the row (here from the session)"
            (is (= "claude" (:client_name row)))))
        (finally (cleanup-calls! :tool_name tool) (cleanup! sid))))))

(deftest ^:parallel record-mcp-tool-call!-client-identity-test
  (testing "client identity is resolved in priority order: _meta clientInfo -> session -> nothing"
    (mt/with-premium-features #{:audit-app}
      (testing "1. _meta clientInfo wins, and its raw name is canonicalized"
        (let [tool (str "meta-" (mt/random-name))]
          (try
            (usage/record-mcp-tool-call! {:tool-name tool :user-id (mt/user->id :rasta)
                                          :status "success" :duration-ms 1
                                          :client-info {:name "ChatGPT" :version "5.0"}})
            (let [row (t2/select-one :model/McpToolCallLog :tool_name tool)]
              (is (= "chatgpt" (:client_name row)))
              (is (= "5.0" (:client_version row))))
            (finally (cleanup-calls! :tool_name tool)))))
      (testing "2. falls back to the session's stored identity when the call carries no _meta"
        (let [sid  (str "identity-session-" (mt/random-name))
              tool (str "session-" (mt/random-name))]
          (try
            (usage/record-mcp-session! {:session-id sid :user-id (mt/user->id :rasta)
                                        :client-info {:name "claude-ai" :version "1.2"}})
            (usage/record-mcp-tool-call! {:tool-name tool :user-id (mt/user->id :rasta)
                                          :session-id sid :status "success" :duration-ms 1})
            (let [row (t2/select-one :model/McpToolCallLog :tool_name tool)]
              (is (= "claude" (:client_name row)))
              (is (= "1.2" (:client_version row))))
            (finally (cleanup-calls! :tool_name tool) (cleanup! sid)))))
      (testing "3. neither _meta nor a session row -> nil client identity (row still logs)"
        (let [tool (str "none-" (mt/random-name))]
          (try
            (usage/record-mcp-tool-call! {:tool-name tool :user-id (mt/user->id :rasta)
                                          :session-id (str "absent-" (mt/random-name))
                                          :status "success" :duration-ms 1})
            (let [row (t2/select-one :model/McpToolCallLog :tool_name tool)]
              (is (some? row))
              (is (nil? (:client_name row)))
              (is (nil? (:client_version row))))
            (finally (cleanup-calls! :tool_name tool))))))))

(deftest record-mcp-tool-call!-pii-gate-test
  (testing "ip/user-agent are denormalized onto the row only when retention is on"
    (mt/with-premium-features #{:audit-app}
      (testing "retention on: PII columns populated"
        (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
          (let [tool (str "pii-on-" (mt/random-name))]
            (try
              (usage/record-mcp-tool-call! {:tool-name tool :user-id (mt/user->id :rasta)
                                            :status "success" :duration-ms 1
                                            :ip-address "203.0.113.7"
                                            :user-agent "Claude/1.0 (macOS)"})
              (let [row (t2/select-one :model/McpToolCallLog :tool_name tool)]
                (is (= "203.0.113.7" (:ip_address row)))
                (is (some? (:user_agent row)))
                (is (some? (:sanitized_user_agent row))))
              (finally (cleanup-calls! :tool_name tool))))))
      (testing "retention off: PII columns stay null"
        (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
          (let [tool (str "pii-off-" (mt/random-name))]
            (try
              (usage/record-mcp-tool-call! {:tool-name tool :user-id (mt/user->id :rasta)
                                            :status "success" :duration-ms 1
                                            :ip-address "203.0.113.7"
                                            :user-agent "Claude/1.0 (macOS)"})
              (let [row (t2/select-one :model/McpToolCallLog :tool_name tool)]
                (is (nil? (:ip_address row)))
                (is (nil? (:user_agent row)))
                (is (nil? (:sanitized_user_agent row))))
              (finally (cleanup-calls! :tool_name tool)))))))))

(deftest ^:parallel record-mcp-tool-call!-normalizes-tool-name-test
  (testing "a blank or over-long tool_name is normalized so the row is still recorded, rather than
           dropped to a swallowed NOT NULL / length-constraint violation"
    (mt/with-premium-features #{:audit-app}
      (testing "a missing tool name falls back to a sentinel"
        ;; tool_name is the value under test, so isolate the row by a unique duration_ms marker
        (let [marker (+ 5000000 (rand-int 1000000))]
          (try
            (usage/record-mcp-tool-call! {:tool-name nil :user-id (mt/user->id :rasta)
                                          :status "error" :duration-ms marker})
            (is (= "unknown" (:tool_name (t2/select-one :model/McpToolCallLog :duration_ms marker))))
            (finally (cleanup-calls! :duration_ms marker)))))
      (testing "an over-long tool name is truncated to the column width"
        (let [marker    (+ 6000000 (rand-int 1000000))
              long-name (apply str (repeat 300 \x))]
          (try
            (usage/record-mcp-tool-call! {:tool-name long-name :user-id (mt/user->id :rasta)
                                          :status "success" :duration-ms marker})
            (is (= 255 (count (:tool_name (t2/select-one :model/McpToolCallLog :duration_ms marker)))))
            (finally (cleanup-calls! :duration_ms marker))))))))

;;; ---------------------------------------- call-tool instrumentation --------------------------------------

(deftest ^:parallel call-tool-records-error-when-handler-throws-test
  (testing "a handler that throws (rather than returning error content) still records an error row,
           then the exception is rethrown so the client still sees the failure"
    (mt/with-premium-features #{:audit-app}
      (let [sid  (str "throw-session-" (mt/random-name))
            tool (str "boom-" (mt/random-name))]
        (try
          (mt/with-dynamic-fn-redefs [mcp.tools/dispatch-tool-call
                                      (fn [& _] (throw (ex-info "kaboom" {})))]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"kaboom"
                                  (mcp.tools/call-tool #{} sid tool {}))))
          (let [row (t2/select-one :model/McpToolCallLog :tool_name tool)]
            (is (some? row) "an error row is recorded even though the handler threw")
            (is (= "error" (:status row))))
          (finally (cleanup-calls! :tool_name tool)))))))

;;; --------------------------------------------- Feature gating --------------------------------------------

(deftest ^:parallel collection-runs-on-ee-without-audit-app-test
  (testing "collection happens on any EE instance (:feature :none), but PII stays null without :audit-app"
    ;; Without :audit-app the `analytics-pii-retention-enabled` setting reads its default (false)
    ;; and cannot be turned on, so PII is never collected — but non-PII rows still are.
    (mt/with-premium-features #{}
      (let [sid  (str "test-session-" (mt/random-name))
            tool (str "query-" (mt/random-name))]
        (try
          (usage/record-mcp-session!
           {:session-id sid :user-id (mt/user->id :rasta) :client-info {:name "claude" :version "1"}
            :user-agent "UA" :ip-address "1.2.3.4"})
          (usage/record-mcp-tool-call! {:tool-name tool :user-id (mt/user->id :rasta)
                                        :session-id sid :status "success" :duration-ms 1})
          (testing "rows are written"
            (is (= 1 (t2/count :model/McpSessionLog :id sid)))
            (is (= 1 (t2/count :model/McpToolCallLog :tool_name tool))))
          (let [row (t2/select-one :model/McpSessionLog :id sid)]
            (testing "non-PII identity is collected"
              (is (= "claude" (:client_name row)))
              (is (= (mt/user->id :rasta) (:user_id row))))
            (testing "PII is null because retention can't be enabled without :audit-app"
              (is (nil? (:ip_address row)))
              (is (nil? (:user_agent row)))))
          (finally (cleanup-calls! :tool_name tool) (cleanup! sid)))))))

;;; ------------------------------------------- Best-effort logging -----------------------------------------

(deftest logging-is-best-effort-test
  (testing "a failed write is swallowed and never propagates"
    (mt/with-premium-features #{:audit-app}
      (mt/with-dynamic-fn-redefs [t2/insert! (fn [& _] (throw (ex-info "boom" {})))]
        (is (nil? (usage/record-mcp-tool-call! {:tool-name "query" :user-id 1 :session-id "x"
                                                :status "success" :duration-ms 1})))
        (is (nil? (usage/record-mcp-session! {:session-id "y" :user-id 1 :client-info {:name "claude"}})))))))

;;; ------------------------------ Integration: drive the real MCP handler ----------------------------------

(defn- jsonrpc [method params id]
  (cond-> {:jsonrpc "2.0" :method method :params params}
    id (assoc :id id)))

(deftest ^:parallel three-write-points-integration-test
  (testing "initialize -> tools/call -> DELETE records session, tool-call, and ended_at"
    ;; Collection runs on any EE instance (:feature :none), so no premium feature is needed here.
    (let [crowberto (mt/user->id :crowberto)
          ;; Unique per run so parallel tests can't collide: the version rides onto the session and,
          ;; via the denormalized identity, onto every tool-call row — a precise lookup/cleanup key.
          ver       (str (random-uuid))
          init-resp (client/client-full-response
                     (test.users/username->token :crowberto)
                     :post "mcp"
                     (jsonrpc "initialize"
                              {:clientInfo {:name "claude-ai" :version ver} :capabilities {}}
                              1))
          sid       (get-in init-resp [:headers "Mcp-Session-Id"])]
      (try
        (testing "initialize writes exactly one session row with handshake identity"
          (is (some? sid))
          (is (= 1 (t2/count :model/McpSessionLog :id sid)))
          (let [row (t2/select-one :model/McpSessionLog :id sid)]
            (is (= "claude" (:client_name row)))
            (is (= ver (:client_version row)))
            (is (= crowberto (:user_id row)))
            (is (nil? (:ended_at row)))))
        ;; complete the handshake, then call a tool
        (client/client-full-response (test.users/username->token :crowberto)
                                     :post "mcp"
                                     {:request-options {:headers {"mcp-session-id" sid}}}
                                     (jsonrpc "notifications/initialized" {} nil))
        (let [call-resp (client/client-full-response
                         (test.users/username->token :crowberto)
                         :post "mcp"
                         {:request-options {:headers {"mcp-session-id" sid}}}
                         (jsonrpc "tools/call" {:name "read_resource"
                                                :arguments {:uris ["metabase://databases"]}} 2))]
          (testing "successful tools/call writes a success row with identity denormalized on it"
            (is (= 200 (:status call-resp)))
            (is (false? (boolean (get-in call-resp [:body :result :isError]))))
            (let [row (t2/select-one :model/McpToolCallLog :tool_name "read_resource" :client_version ver)]
              (is (some? row))
              (is (= "success" (:status row)))
              (is (= crowberto (:user_id row)))
              (is (nat-int? (:duration_ms row)))
              (testing "client identity is denormalized from the session (the call carried no _meta)"
                (is (= "claude" (:client_name row)))
                (is (= ver (:client_version row)))))))
        (testing "an unknown tool records a status=error row and the error propagates to the client"
          (let [err-resp (client/client-full-response
                          (test.users/username->token :crowberto)
                          :post "mcp"
                          {:request-options {:headers {"mcp-session-id" sid}}}
                          (jsonrpc "tools/call" {:name "no_such_tool" :arguments {}} 3))]
            (is (true? (boolean (get-in err-resp [:body :result :isError]))))
            (let [row (t2/select-one :model/McpToolCallLog :tool_name "no_such_tool" :client_version ver)]
              (is (some? row))
              (is (= "error" (:status row)))
              ;; unknown tool -> JSON-RPC "method not found"; error_code is non-PII, always recorded
              (is (= -32601 (:error_code row))))))
        (testing "DELETE stamps ended_at on the session row"
          (client/client-full-response (test.users/username->token :crowberto)
                                       :delete "mcp"
                                       {:request-options {:headers {"mcp-session-id" sid}}})
          (is (some? (:ended_at (t2/select-one :model/McpSessionLog :id sid)))))
        (finally
          (cleanup-calls! :client_version ver)
          (cleanup! sid))))))
