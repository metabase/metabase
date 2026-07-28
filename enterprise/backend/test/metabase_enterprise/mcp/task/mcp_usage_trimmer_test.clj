(ns metabase-enterprise.mcp.task.mcp-usage-trimmer-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.mcp.task.mcp-usage-trimmer :as mcp-usage-trimmer]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

;; NOTE: these tests deliberately do NOT wrap in `mt/with-premium-features #{:audit-app}` — MCP usage
;; is collected on every EE instance, so its trimmer must run regardless of the audit-app feature.

(deftest trims-rows-older-than-custom-retention-test
  (testing "with retention set to 30 days, session + tool-call rows older than 30 days are deleted"
    (mt/with-temp
      [:model/McpSessionLog {s-recent :id} {:id "sess-recent" :created_at (t/offset-date-time)}
       :model/McpSessionLog {s-old :id}    {:id "sess-old"    :created_at (t/minus (t/offset-date-time) (t/days 200))}
       :model/McpToolCallLog {tc-recent :id} {:tool_name "query" :created_at (t/offset-date-time)}
       :model/McpToolCallLog {tc-boundary :id} {:tool_name "query" :created_at (t/minus (t/offset-date-time) (t/days 31))}
       :model/McpToolCallLog {tc-old :id} {:tool_name "query" :created_at (t/minus (t/offset-date-time) (t/days 200))}]
      (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 30]
        (#'mcp-usage-trimmer/trim-old-mcp-usage-data!)
        (is (= #{s-recent}
               (t2/select-fn-set :id :model/McpSessionLog {:where [:in :id [s-recent s-old]]}))
            "old session rows are deleted, recent kept")
        (is (= #{tc-recent}
               (t2/select-fn-set :id :model/McpToolCallLog {:where [:in :id [tc-recent tc-boundary tc-old]]}))
            "tool-call rows older than the cutoff are deleted, recent kept")))))

(deftest skips-deletion-when-retention-is-infinite-test
  (testing "when retention is set to 0 (infinite), no rows are deleted"
    (mt/with-temp
      [:model/McpSessionLog {s-recent :id} {:id "sess-recent-inf" :created_at (t/offset-date-time)}
       :model/McpSessionLog {s-old :id}    {:id "sess-old-inf"    :created_at (t/minus (t/offset-date-time) (t/years 5))}
       :model/McpToolCallLog {tc-old :id}  {:tool_name "query" :created_at (t/minus (t/offset-date-time) (t/years 5))}]
      (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 0]
        (#'mcp-usage-trimmer/trim-old-mcp-usage-data!)
        (is (= #{s-recent s-old}
               (t2/select-fn-set :id :model/McpSessionLog {:where [:in :id [s-recent s-old]]})))
        (is (= #{tc-old}
               (t2/select-fn-set :id :model/McpToolCallLog {:where [:in :id [tc-old]]})))))))
