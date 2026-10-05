(ns metabase.mcp.scope-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.scope :as mcp.scope]))

(set! *warn-on-reflection* true)

(deftest matches?-test
  (testing "nil token-scopes hold no scope, so they match nothing: no MCP caller skips the scope check"
    (is (false? (mcp.scope/matches? nil "agent:read")))
    (is (false? (mcp.scope/matches? nil #{"agent:read" "agent:write"})))
    (is (false? (mcp.scope/matches? nil nil))))
  (testing "public-or-matches? keeps a nil required scope public, but nil token-scopes grant nothing else"
    (is (true? (mcp.scope/public-or-matches? nil nil)))
    (is (false? (mcp.scope/public-or-matches? nil "agent:read"))))
  (testing "the unrestricted sentinel is not a scope, so it matches nothing"
    (is (false? (mcp.scope/matches? #{::scope/unrestricted} "agent:read")))
    (is (false? (mcp.scope/matches? #{::scope/unrestricted} nil))))
  (testing "nil required-scope with scoped token → denied"
    (is (false? (mcp.scope/matches? #{"agent:read"} nil)))
    (is (false? (mcp.scope/matches? #{} nil))))
  (testing "exact scope match"
    (is (true? (mcp.scope/matches? #{"agent:read"} "agent:read")))
    (is (false? (mcp.scope/matches? #{"agent:write"} "agent:read"))))
  (testing "MCP honors literal scopes only: a wildcard grant matches no scope it would cover"
    (doseq [grant ["agent:*" "agent:query:*" "*"]]
      (testing grant
        (is (false? (mcp.scope/matches? #{grant} "agent:query:run")))
        (is (false? (mcp.scope/matches? #{grant} #{"agent:query:run" "agent:sql:run"}))))))
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

(def ^:private nil-scopes-bypass
  "Source text that branches on token-scopes being absent: `(nil? token-scopes)`, `(some? token-scopes)`,
  `(or token-scopes ...)`, or `(if`/`when`/`if-not`/`when-not token-scopes ...)`. Each would let a caller with no
  scopes skip a check."
  #"\((?:nil\?|some\?|or|if|when|if-not|when-not)\s+token-scopes\b")

(defn- mcp-source-files []
  (->> ["src/metabase/mcp" "src/metabase/agent_api/query_guards.clj"]
       (map io/file)
       (mapcat file-seq)
       (filter #(str/ends-with? (.getName ^java.io.File %) ".clj"))))

(deftest ^:parallel mcp-code-never-names-the-unrestricted-sentinel-test
  (testing "Only OAuth tokens reach MCP, and they carry literal scopes, so no MCP code may treat a request as
            unrestricted. A source file that names the sentinel is a branch that would."
    (let [files (mcp-source-files)]
      (is (< 20 (count files)) "the walk must find the MCP sources, or this proves nothing")
      (is (= [] (filterv #(re-find unrestricted-reference (slurp %)) files))))))

(deftest ^:parallel mcp-code-never-bypasses-scopes-on-nil-test
  (testing "nil token-scopes grant nothing in MCP, so no MCP code may branch on their absence to skip a scope check"
    (testing "the pattern catches the bypass it names"
      (is (re-find nil-scopes-bypass "(or (nil? token-scopes) (matches? token-scopes s))"))
      (is (re-find nil-scopes-bypass "(when-not token-scopes ok)")))
    (let [files (mcp-source-files)]
      (is (< 20 (count files)) "the walk must find the MCP sources, or this proves nothing")
      (is (= [] (filterv #(re-find nil-scopes-bypass (slurp %)) files))))))
