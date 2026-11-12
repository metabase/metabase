(ns metabase.mcp.scope-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.scope :as mcp.scope]))

(deftest matches?-test
  (testing "GHY-4942: nil token-scopes hold no scope, so they match nothing"
    (is (false? (mcp.scope/matches? nil "agent:content:read")))
    (is (false? (mcp.scope/matches? nil nil))))
  (testing "GHY-4942: the unrestricted sentinel is not an MCP scope, so it matches nothing"
    (is (false? (mcp.scope/matches? #{::scope/unrestricted} "agent:content:read")))
    (is (false? (mcp.scope/matches? #{::scope/unrestricted} nil))))
  (testing "nil required-scope with scoped token → denied"
    (is (false? (mcp.scope/matches? #{"agent:content:read"} nil)))
    (is (false? (mcp.scope/matches? #{} nil))))
  (testing "exact scope match"
    (is (true? (mcp.scope/matches? #{"agent:content:read"} "agent:content:read")))
    (is (false? (mcp.scope/matches? #{"agent:content:write"} "agent:content:read"))))
  (testing "GHY-4942: a wildcard string is not a registered scope, so it matches nothing, not even itself as a
            prefix; only the scope named exactly matches"
    (is (false? (mcp.scope/matches? #{"*"} "agent:content:read")))
    (is (false? (mcp.scope/matches? #{"agent:*"} "agent:content:read")))
    (is (false? (mcp.scope/matches? #{"agent:content:*"} "agent:content:read")))
    (is (true? (mcp.scope/matches? #{"*" "agent:content:read"} "agent:content:read"))))
  (testing "GHY-4942: a required scope outside the v2 surface matches nothing, even when the token holds it"
    (is (false? (mcp.scope/matches? #{"agent:sql:execute"} "agent:sql:execute")))
    (is (false? (mcp.scope/matches? #{"*"} "*"))))
  (testing "no match"
    (is (false? (mcp.scope/matches? #{"foo:bar"} "agent:content:read")))
    (is (false? (mcp.scope/matches? #{} "agent:content:read")))))

(deftest valid-scope?-test
  (testing "GHY-4942: every v2 surface scope is valid, and nothing else is"
    (is (every? mcp.scope/valid-scope? mcp.scope/v2-surface-scopes))
    (are [scope] (false? (mcp.scope/valid-scope? scope))
      nil
      "*"
      "agent:*"
      "agent:sql:execute"
      "mb:full"
      ::scope/unrestricted)))

(deftest v2-baseline-scope?-test
  (testing "the consent page locks reading and running queries, and nothing else"
    (is (= ["agent:content:read" "agent:query:run"]
           (filterv mcp.scope/v2-baseline-scope? mcp.scope/v2-surface-scopes)))
    (is (false? (mcp.scope/v2-baseline-scope? nil)))))
