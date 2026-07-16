(ns metabase.metabot.tools.mcp-client-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.metabot.self.claude :as self.claude]
   [metabase.metabot.tools.mcp-client :as mcp-client]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest ^:parallel tool->claude-input-schema-passthrough-test
  (testing "a tool-def carrying :input-schema serializes its raw JSON Schema straight through"
    (let [tool->claude (var-get #'self.claude/tool->claude)
          json-schema  {:type "object" :properties {:term_queries {:type "array"}}}]
      (is (= {:name "mcp_search" :description "Search." :input_schema json-schema}
             (tool->claude {:tool-name "mcp_search" :doc "Search." :input-schema json-schema :schema nil}))))))

(deftest ^:parallel tools-briefing-test
  (testing "briefs only the mcp_ tools, one line each; nil when there are none"
    (let [tools {"search"     {:tool-name "search" :doc "native"}
                 "mcp_create_dashboard" {:tool-name "mcp_create_dashboard" :doc "Create a dashboard.\nMore."}
                 "mcp_search" {:tool-name "mcp_search" :doc "Search Metabase."}}
          brief (mcp-client/tools-briefing tools)]
      (is (re-find #"mcp_create_dashboard" brief))
      (is (re-find #"mcp_search" brief))
      (is (not (re-find #"- `search`" brief)) "native tools are not briefed here")
      (is (not (re-find #"More\." brief)) "only the first doc line is used"))
    (is (nil? (mcp-client/tools-briefing {"search" {:tool-name "search" :doc "native"}})))))

(deftest mcp-client-round-trip-test
  (testing "the in-process client drives the real MCP handler: initialize -> tools/list -> tools/call"
    (search.tu/with-legacy-search
      (let [user-id (mt/user->id :crowberto)]
        (mt/with-current-user user-id
          (let [client (mcp-client/initialize! user-id)]
            (is (string? (:session-id client)) "initialize returns a real Mcp-Session-Id")
            (is (contains? (into #{} (map :name) (mcp-client/list-tools! client)) "search"))
            (let [content (mcp-client/call-tool! client "search" {:term_queries ["orders"]})]
              (is (nil? (:isError content)))
              (is (= "text" (-> content :content first :type))))))))))

(deftest mcp-self-tool-defs-test
  (testing "bridged MCP tools become agent-loop tool-defs that authenticate via the captured user"
    (search.tu/with-legacy-search
      (let [user-id (mt/user->id :crowberto)
            defs    (mt/with-current-user user-id (mcp-client/mcp-self-tool-defs user-id))
            tool    (get defs "mcp_search")]
        (is (some? tool) "search is surfaced under its mcp_ prefix")
        (is (= "mcp_search" (:tool-name tool)))
        (is (map? (:input-schema tool)) "input-schema is a raw JSON Schema map")
        (testing ":fn runs with *current-user-id* UNBOUND (the tool-executor virtual-thread case)"
          (is (nil? api/*current-user-id*))
          (let [result ((:fn tool) {:term_queries ["orders"]})]
            (is (string? (:output result)))
            (is (seq (:output result)))))))))
