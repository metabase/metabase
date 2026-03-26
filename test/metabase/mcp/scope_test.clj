(ns metabase.mcp.scope-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.scope :as mcp.scope]))

(deftest matches?-test
  (testing "nil token-scopes (internal callers) → always matches"
    (is (true? (mcp.scope/matches? nil "agent:read")))
    (is (true? (mcp.scope/matches? nil nil))))
  (testing "unrestricted token-scopes → always matches"
    (is (true? (mcp.scope/matches? #{::scope/unrestricted} "agent:read")))
    (is (true? (mcp.scope/matches? #{::scope/unrestricted} nil))))
  (testing "nil tool-scope with scoped token → denied"
    (is (nil? (mcp.scope/matches? #{"agent:read"} nil)))
    (is (nil? (mcp.scope/matches? #{} nil))))
  (testing "exact scope match"
    (is (true? (mcp.scope/matches? #{"agent:read"} "agent:read")))
    (is (nil? (mcp.scope/matches? #{"agent:write"} "agent:read"))))
  (testing "wildcard scope match"
    (is (true? (mcp.scope/matches? #{"agent:*"} "agent:read")))
    (is (true? (mcp.scope/matches? #{"agent:*"} "agent:write")))
    (is (nil? (mcp.scope/matches? #{"other:*"} "agent:read"))))
  (testing "no match"
    (is (nil? (mcp.scope/matches? #{"foo:bar"} "agent:read")))
    (is (nil? (mcp.scope/matches? #{} "agent:read")))))
