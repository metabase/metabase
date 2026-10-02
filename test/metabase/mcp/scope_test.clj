(ns metabase.mcp.scope-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.scope :as mcp.scope]))

(set! *warn-on-reflection* true)

(deftest matches?-test
  (testing "nil token-scopes (internal callers) → always matches"
    (is (true? (mcp.scope/matches? nil "agent:read")))
    (is (true? (mcp.scope/matches? nil nil))))
  (testing "the unrestricted sentinel is not a scope, so it matches nothing"
    (is (false? (mcp.scope/matches? #{::scope/unrestricted} "agent:read")))
    (is (false? (mcp.scope/matches? #{::scope/unrestricted} nil))))
  (testing "nil required-scope with scoped token → denied"
    (is (false? (mcp.scope/matches? #{"agent:read"} nil)))
    (is (false? (mcp.scope/matches? #{} nil))))
  (testing "exact scope match"
    (is (true? (mcp.scope/matches? #{"agent:read"} "agent:read")))
    (is (false? (mcp.scope/matches? #{"agent:write"} "agent:read"))))
  (testing "wildcard scope match"
    (is (true? (mcp.scope/matches? #{"agent:*"} "agent:read")))
    (is (true? (mcp.scope/matches? #{"agent:*"} "agent:write")))
    (is (false? (mcp.scope/matches? #{"other:*"} "agent:read"))))
  (testing "any required scope match"
    (is (true? (mcp.scope/matches? #{"agent:read"} #{"agent:read" "agent:write"})))
    (is (true? (mcp.scope/matches? #{"agent:write"} #{"agent:read" "agent:write"})))
    (is (false? (mcp.scope/matches? #{"other:read"} #{"agent:read" "agent:write"}))))
  (testing "no match"
    (is (false? (mcp.scope/matches? #{"foo:bar"} "agent:read")))
    (is (false? (mcp.scope/matches? #{} "agent:read")))))

(def ^:private unrestricted-reference
  "Source text that names the `::scope/unrestricted` keyword, under any alias or fully qualified."
  #"::[\w.-]*scope/unrestricted|:metabase\.api\.macros\.scope/unrestricted")

(deftest ^:parallel mcp-code-never-names-the-unrestricted-sentinel-test
  (testing "Only OAuth tokens reach MCP, and they carry literal scopes, so no MCP code may treat a request as
            unrestricted. A source file that names the sentinel is a branch that would."
    (let [files (->> ["src/metabase/mcp" "src/metabase/agent_api/query_guards.clj"]
                     (map io/file)
                     (mapcat file-seq)
                     (filter #(str/ends-with? (.getName ^java.io.File %) ".clj")))]
      (is (< 20 (count files)) "the walk must find the MCP sources, or this proves nothing")
      (is (= [] (filterv #(re-find unrestricted-reference (slurp %)) files))))))
