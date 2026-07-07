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
  (t2/delete! :model/McpToolCallLog :mcp_session_id session-id)
  (t2/delete! :model/McpSessionLog :id session-id))

;;; ----------------------------------------- detect-client (pure) ------------------------------------------

(deftest detect-client-test
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

(deftest proxy-probe?-test
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

(deftest record-mcp-session!-identity-set-once-test
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

(deftest record-mcp-session!-ignores-mcp-remote-probe-test
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

(deftest record-mcp-session-end!-stamps-ended-at-test
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

(deftest record-mcp-tool-call!-writes-row-test
  (mt/with-premium-features #{:audit-app}
    (let [sid (str "test-session-" (mt/random-name))]
      (try
        (usage/record-mcp-session! {:session-id sid :user-id (mt/user->id :rasta) :client-info {:name "claude"}})
        (usage/record-mcp-tool-call! {:tool-name "query" :user-id (mt/user->id :rasta)
                                      :session-id sid :status "success" :duration-ms 12})
        (let [row (t2/select-one :model/McpToolCallLog :mcp_session_id sid)]
          (is (= "query" (:tool_name row)))
          (is (= "success" (:status row)))
          (is (= 12 (:duration_ms row)))
          (is (= (mt/user->id :rasta) (:user_id row))))
        (finally (cleanup! sid))))))

(deftest record-mcp-tool-call!-missing-session-fallback-test
  (testing "a tool call whose session row is absent still logs (no FK constraint)"
    (mt/with-premium-features #{:audit-app}
      (let [sid (str "absent-session-" (mt/random-name))]
        (try
          (usage/record-mcp-tool-call! {:tool-name "query" :user-id (mt/user->id :rasta)
                                        :session-id sid :status "error" :duration-ms 3})
          (is (= 0 (t2/count :model/McpSessionLog :id sid)))
          (let [row (t2/select-one :model/McpToolCallLog :mcp_session_id sid)]
            (is (some? row))
            (is (= "error" (:status row))))
          (finally (cleanup! sid)))))))

(deftest ^:parallel record-mcp-tool-call!-normalizes-tool-name-test
  (testing "a blank or over-long tool_name is normalized so the row is still recorded, rather than
           dropped to a swallowed NOT NULL / length-constraint violation"
    (mt/with-premium-features #{:audit-app}
      (testing "a missing tool name falls back to a sentinel"
        (let [sid (str "toolname-nil-" (mt/random-name))]
          (try
            (usage/record-mcp-tool-call! {:tool-name nil :user-id (mt/user->id :rasta)
                                          :session-id sid :status "error" :duration-ms 1})
            (is (= "unknown" (:tool_name (t2/select-one :model/McpToolCallLog :mcp_session_id sid))))
            (finally (cleanup! sid)))))
      (testing "an over-long tool name is truncated to the column width"
        (let [sid       (str "toolname-long-" (mt/random-name))
              long-name (apply str (repeat 300 \x))]
          (try
            (usage/record-mcp-tool-call! {:tool-name long-name :user-id (mt/user->id :rasta)
                                          :session-id sid :status "success" :duration-ms 1})
            (is (= 255 (count (:tool_name (t2/select-one :model/McpToolCallLog :mcp_session_id sid)))))
            (finally (cleanup! sid))))))))

;;; ---------------------------------------- call-tool instrumentation --------------------------------------

(deftest ^:parallel call-tool-records-error-when-handler-throws-test
  (testing "a handler that throws (rather than returning error content) still records an error row,
           then the exception is rethrown so the client still sees the failure"
    (mt/with-premium-features #{:audit-app}
      (let [sid (str "throw-session-" (mt/random-name))]
        (try
          (mt/with-dynamic-fn-redefs [mcp.tools/dispatch-tool-call
                                      (fn [& _] (throw (ex-info "kaboom" {})))]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"kaboom"
                                  (mcp.tools/call-tool #{} sid "boom_tool" {}))))
          (let [row (t2/select-one :model/McpToolCallLog :mcp_session_id sid)]
            (is (some? row) "an error row is recorded even though the handler threw")
            (is (= "boom_tool" (:tool_name row)))
            (is (= "error" (:status row))))
          (finally (cleanup! sid)))))))

;;; --------------------------------------------- Feature gating --------------------------------------------

(deftest collection-runs-on-ee-without-audit-app-test
  (testing "collection happens on any EE instance (:feature :none), but PII stays null without :audit-app"
    ;; Without :audit-app the `analytics-pii-retention-enabled` setting reads its default (false)
    ;; and cannot be turned on, so PII is never collected — but non-PII rows still are.
    (mt/with-premium-features #{}
      (let [sid (str "test-session-" (mt/random-name))]
        (try
          (usage/record-mcp-session!
           {:session-id sid :user-id (mt/user->id :rasta) :client-info {:name "claude" :version "1"}
            :user-agent "UA" :ip-address "1.2.3.4"})
          (usage/record-mcp-tool-call! {:tool-name "query" :user-id (mt/user->id :rasta)
                                        :session-id sid :status "success" :duration-ms 1})
          (testing "rows are written"
            (is (= 1 (t2/count :model/McpSessionLog :id sid)))
            (is (= 1 (t2/count :model/McpToolCallLog :mcp_session_id sid))))
          (let [row (t2/select-one :model/McpSessionLog :id sid)]
            (testing "non-PII identity is collected"
              (is (= "claude" (:client_name row)))
              (is (= (mt/user->id :rasta) (:user_id row))))
            (testing "PII is null because retention can't be enabled without :audit-app"
              (is (nil? (:ip_address row)))
              (is (nil? (:user_agent row)))))
          (finally (cleanup! sid)))))))

;;; ------------------------------------------- Best-effort logging -----------------------------------------

(deftest logging-is-best-effort-test
  (testing "a failed write is swallowed and never propagates"
    (mt/with-premium-features #{:audit-app}
      (with-redefs [t2/insert! (fn [& _] (throw (ex-info "boom" {})))]
        (is (nil? (usage/record-mcp-tool-call! {:tool-name "query" :user-id 1 :session-id "x"
                                                :status "success" :duration-ms 1})))
        (is (nil? (usage/record-mcp-session! {:session-id "y" :user-id 1 :client-info {:name "claude"}})))))))

;;; ------------------------------ Integration: drive the real MCP handler ----------------------------------

(defn- jsonrpc [method params id]
  (cond-> {:jsonrpc "2.0" :method method :params params}
    id (assoc :id id)))

(deftest three-write-points-integration-test
  (testing "initialize -> tools/call -> DELETE records session, tool-call, and ended_at"
    ;; Collection runs on any EE instance (:feature :none), so no premium feature is needed here.
    (let [crowberto (mt/user->id :crowberto)
          init-resp (client/client-full-response
                     (test.users/username->token :crowberto)
                     :post "mcp"
                     (jsonrpc "initialize"
                              {:clientInfo {:name "claude-ai" :version "1.0"} :capabilities {}}
                              1))
          sid       (get-in init-resp [:headers "Mcp-Session-Id"])]
      (try
        (testing "initialize writes exactly one session row with handshake identity"
          (is (some? sid))
          (is (= 1 (t2/count :model/McpSessionLog :id sid)))
          (let [row (t2/select-one :model/McpSessionLog :id sid)]
            (is (= "claude" (:client_name row)))
            (is (= "1.0" (:client_version row)))
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
          (testing "successful tools/call writes a success row linked to the session"
            (is (= 200 (:status call-resp)))
            (is (false? (boolean (get-in call-resp [:body :result :isError]))))
            (let [row (t2/select-one :model/McpToolCallLog :mcp_session_id sid :tool_name "read_resource")]
              (is (some? row))
              (is (= "success" (:status row)))
              (is (= crowberto (:user_id row)))
              (is (nat-int? (:duration_ms row)))
              (testing "mcp_session_id resolves to the session row"
                (is (= 1 (t2/count :model/McpSessionLog :id (:mcp_session_id row))))))))
        (testing "an unknown tool records a status=error row and the error propagates to the client"
          (let [err-resp (client/client-full-response
                          (test.users/username->token :crowberto)
                          :post "mcp"
                          {:request-options {:headers {"mcp-session-id" sid}}}
                          (jsonrpc "tools/call" {:name "no_such_tool" :arguments {}} 3))]
            (is (true? (boolean (get-in err-resp [:body :result :isError]))))
            (let [row (t2/select-one :model/McpToolCallLog :mcp_session_id sid :tool_name "no_such_tool")]
              (is (some? row))
              (is (= "error" (:status row)))
              ;; unknown tool -> JSON-RPC "method not found"; error_code is non-PII, always recorded
              (is (= -32601 (:error_code row))))))
        (testing "DELETE stamps ended_at on the session row"
          (client/client-full-response (test.users/username->token :crowberto)
                                       :delete "mcp"
                                       {:request-options {:headers {"mcp-session-id" sid}}})
          (is (some? (:ended_at (t2/select-one :model/McpSessionLog :id sid)))))
        (finally (cleanup! sid))))))
