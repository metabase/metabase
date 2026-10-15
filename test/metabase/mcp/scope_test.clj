(ns metabase.mcp.scope-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.scope :as mcp.scope]))

(deftest matches?-test
  (testing "GHY-4942: nil token-scopes hold no scope, so they match nothing"
    (is (false? (mcp.scope/matches? nil "agent:read")))
    (is (false? (mcp.scope/matches? nil nil))))
  (testing "GHY-4942: the unrestricted sentinel is not an MCP scope, so it matches nothing"
    (is (false? (mcp.scope/matches? #{::scope/unrestricted} "agent:read")))
    (is (false? (mcp.scope/matches? #{::scope/unrestricted} nil))))
  (testing "nil required-scope with scoped token → denied"
    (is (false? (mcp.scope/matches? #{"agent:read"} nil)))
    (is (false? (mcp.scope/matches? #{} nil))))
  (testing "exact scope match"
    (is (true? (mcp.scope/matches? #{"agent:read"} "agent:read")))
    (is (false? (mcp.scope/matches? #{"agent:write"} "agent:read"))))
  (testing "GHY-4942: a wildcard string is not a registered scope, so it matches nothing, not even itself as a
            prefix; only the scope named exactly matches"
    (is (false? (mcp.scope/matches? #{"*"} "agent:read")))
    (is (false? (mcp.scope/matches? #{"agent:*"} "agent:read")))
    (is (false? (mcp.scope/matches? #{"agent:read:*"} "agent:read:x")))
    (is (true? (mcp.scope/matches? #{"*" "agent:read"} "agent:read"))))
  (testing "no match"
    (is (false? (mcp.scope/matches? #{"foo:bar"} "agent:read")))
    (is (false? (mcp.scope/matches? #{} "agent:read")))))
