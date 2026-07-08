(ns metabase-enterprise.mcp.v-mcp-tool-calls-test
  "Tests for the `v_mcp_tool_calls` SQL view. Identity is denormalized onto each tool-call row
  (no session join), and the view derives `client_display_name` / `error_type` / `user_display_name`
  from it."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

(defn- query-view
  "Query v_mcp_tool_calls, returning only rows for the given tool-call ids."
  [tool-call-ids]
  (t2/query {:select [:*]
             :from   [:v_mcp_tool_calls]
             :where  [:in :tool_call_id tool-call-ids]}))

(defn- find-row [rows tool-call-id]
  (some #(when (= (:tool_call_id %) tool-call-id) %) rows))

(deftest joins-and-derived-columns-test
  (testing "the view derives display columns from the identity denormalized on each tool-call row"
    (mt/with-temp
      [:model/User          {user-id :id} {:first_name "Ada" :last_name "Lovelace"}
       :model/McpToolCallLog {ok-id :id} {:user_id user-id
                                          :tool_name "query" :status "success" :duration_ms 42
                                          :client_name "claude" :client_version "1.4.2"
                                          :created_at (t/offset-date-time)}
       :model/McpToolCallLog {err-id :id} {:user_id user-id
                                           :tool_name "query" :status "error" :duration_ms 7
                                           :client_name "claude" :client_version "1.4.2"
                                           :error_code -32602 :error_message "bad params"
                                           :created_at (t/offset-date-time)}]
      (let [rows (query-view [ok-id err-id])
            ok   (find-row rows ok-id)
            err  (find-row rows err-id)]
        (is (=? {:tool_name           "query"
                 :status              "success"
                 :client_name         "claude"
                 :client_display_name "Claude"
                 :client_version      "1.4.2"
                 :user_display_name   "Ada Lovelace"
                 :error_type          nil}
                ok))
        (is (=? {:status        "error"
                 :error_type    "Invalid params"
                 :error_message "bad params"}
                err))))))

(deftest unknown-client-and-user-test
  (testing "a tool call with no denormalized client and no user still appears, with null display columns"
    (mt/with-temp
      [:model/McpToolCallLog {orphan-id :id} {:user_id nil
                                              :tool_name "query" :status "success" :duration_ms 5
                                              :created_at (t/offset-date-time)}]
      (let [row (find-row (query-view [orphan-id]) orphan-id)]
        (is (some? row) "the row is not dropped")
        (is (=? {:tool_name "query" :client_name nil :client_display_name nil :user_display_name nil}
                row))))))

;; Guard the hand-maintained error_code -> error_type coupling. These pairs must stay in sync with
;; the CASE in the v_mcp_tool_calls view SQL and the error-code-* constants in metabase.mcp.tools; a
;; drift on either side breaks this test rather than silently mislabeling errors.
(def ^:private error-code->type
  {-32600 "Invalid request"
   -32601 "Method not found"
   -32602 "Invalid params"
   -32603 "Internal error"
   -32000 "Server error"
   -99999 nil})

(deftest error-code-to-type-mapping-test
  (testing "every JSON-RPC error_code maps to the expected error_type (and unknown codes -> nil)"
    (doseq [[code expected] error-code->type]
      (mt/with-temp
        [:model/McpToolCallLog {id :id} {:tool_name "query" :status "error" :duration_ms 1
                                         :error_code code :created_at (t/offset-date-time)}]
        (is (= expected (:error_type (find-row (query-view [id]) id)))
            (format "error_code %d should map to %s" code (pr-str expected)))))))
