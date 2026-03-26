(ns metabase.mcp.tools-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.tools :as mcp.tools]))

(deftest scope-matches?-test
  (let [scope-matches? #'mcp.tools/scope-matches?]
    (testing "nil token-scopes (internal callers) → always matches"
      (is (true? (scope-matches? nil "agent:read")))
      (is (true? (scope-matches? nil nil))))
    (testing "unrestricted token-scopes → always matches"
      (is (true? (scope-matches? #{::scope/unrestricted} "agent:read")))
      (is (true? (scope-matches? #{::scope/unrestricted} nil))))
    (testing "nil tool-scope with scoped token → denied"
      (is (nil? (scope-matches? #{"agent:read"} nil)))
      (is (nil? (scope-matches? #{} nil))))
    (testing "exact scope match"
      (is (true? (scope-matches? #{"agent:read"} "agent:read")))
      (is (nil? (scope-matches? #{"agent:write"} "agent:read"))))
    (testing "wildcard scope match"
      (is (true? (scope-matches? #{"agent:*"} "agent:read")))
      (is (true? (scope-matches? #{"agent:*"} "agent:write")))
      (is (nil? (scope-matches? #{"other:*"} "agent:read"))))
    (testing "no match"
      (is (nil? (scope-matches? #{"foo:bar"} "agent:read")))
      (is (nil? (scope-matches? #{} "agent:read"))))))
