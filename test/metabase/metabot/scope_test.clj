(ns metabase.metabot.scope-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.scope :as scope]))

(deftest scope-matches?-test
  (testing "exact match"
    (is (scope/scope-matches? #{"agent:sql:create"} "agent:sql:create"))
    (is (not (scope/scope-matches? #{"agent:sql:edit"} "agent:sql:create"))))

  (testing "unrestricted wildcard"
    (is (scope/scope-matches? #{"*"} "agent:sql:create"))
    (is (scope/scope-matches? scope/unrestricted "agent:anything:here")))

  (testing "hierarchical wildcard"
    (is (scope/scope-matches? #{"agent:sql:*"} "agent:sql:create"))
    (is (scope/scope-matches? #{"agent:sql:*"} "agent:sql:edit"))
    (is (not (scope/scope-matches? #{"agent:sql:*"} "agent:notebook:create"))))

  (testing "mid-level wildcard"
    (is (scope/scope-matches? #{"agent:*"} "agent:sql:create"))
    (is (scope/scope-matches? #{"agent:*"} "agent:viz:edit"))
    (is (not (scope/scope-matches? #{"other:*"} "agent:sql:create"))))

  (testing "empty scope set grants nothing"
    (is (not (scope/scope-matches? #{} "agent:sql:create")))
    (is (not (scope/scope-matches? #{} "agent:search"))))

  (testing "multiple granted scopes"
    (is (scope/scope-matches? #{"agent:sql:create" "agent:viz:edit"} "agent:sql:create"))
    (is (scope/scope-matches? #{"agent:sql:create" "agent:viz:edit"} "agent:viz:edit"))
    (is (not (scope/scope-matches? #{"agent:sql:create" "agent:viz:edit"} "agent:notebook:create"))))

  (testing "malformed scope strings do not match"
    (is (not (scope/scope-matches? #{""} "agent:sql:create")))
    (is (not (scope/scope-matches? #{":"} "agent:sql:create")))
    (is (not (scope/scope-matches? #{"agent:sql:create"} "")))))

(deftest current-user-scope-default-test
  (testing "*current-user-scope* defaults to empty set (no permissions)"
    (is (= #{} scope/*current-user-scope*))))

(deftest user-metabot-perms->scopes-test
  (testing "stub returns empty set"
    (is (= #{} (scope/user-metabot-perms->scopes {})))
    (is (= #{} (scope/user-metabot-perms->scopes nil)))))
