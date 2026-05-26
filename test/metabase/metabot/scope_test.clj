(ns metabase.metabot.scope-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.api-scope.core :as api-scope]
   [metabase.metabot.agent.profiles]
   [metabase.metabot.scope :as scope]))

(deftest ^:parallel scope-matches?-test
  (testing "exact match"
    (is (api-scope/scope-matches? #{"agent:sql:create"} "agent:sql:create"))
    (is (not (api-scope/scope-matches? #{"agent:sql:edit"} "agent:sql:create"))))

  (testing "unrestricted wildcard"
    (is (api-scope/scope-matches? #{"*"} "agent:sql:create"))
    (is (api-scope/scope-matches? api-scope/unrestricted "agent:anything:here")))

  (testing "hierarchical wildcard"
    (is (api-scope/scope-matches? #{"agent:sql:*"} "agent:sql:create"))
    (is (api-scope/scope-matches? #{"agent:sql:*"} "agent:sql:edit"))
    (is (not (api-scope/scope-matches? #{"agent:sql:*"} "agent:notebook:create"))))

  (testing "mid-level wildcard"
    (is (api-scope/scope-matches? #{"agent:*"} "agent:sql:create"))
    (is (api-scope/scope-matches? #{"agent:*"} "agent:viz:edit"))
    (is (not (api-scope/scope-matches? #{"other:*"} "agent:sql:create"))))

  (testing "empty scope set grants nothing"
    (is (not (api-scope/scope-matches? #{} "agent:sql:create")))
    (is (not (api-scope/scope-matches? #{} "agent:search"))))

  (testing "multiple granted scopes"
    (is (api-scope/scope-matches? #{"agent:sql:create" "agent:viz:edit"} "agent:sql:create"))
    (is (api-scope/scope-matches? #{"agent:sql:create" "agent:viz:edit"} "agent:viz:edit"))
    (is (not (api-scope/scope-matches? #{"agent:sql:create" "agent:viz:edit"} "agent:notebook:create"))))

  (testing "malformed scope strings do not match"
    (is (not (api-scope/scope-matches? #{""} "agent:sql:create")))
    (is (not (api-scope/scope-matches? #{":"} "agent:sql:create")))
    (is (not (api-scope/scope-matches? #{"agent:sql:create"} "")))))

(deftest ^:parallel current-user-scope-default-test
  (testing "*current-user-scope* defaults to empty set (no permissions)"
    (is (= #{} scope/*current-user-scope*))))

(deftest ^:parallel perms->scopes-default-test
  (is (= scope/always-granted-scopes (scope/user-metabot-perms->scopes {})))
  (is (= scope/always-granted-scopes (scope/user-metabot-perms->scopes nil))))

(deftest ^:parallel perms->scopes-sql-generation-test
  (let [scopes (scope/user-metabot-perms->scopes {:permission/metabot-sql-generation :yes})]
    (is (contains? scopes "agent:sql:*"))
    (is (contains? scopes "agent:transforms:*"))
    (is (contains? scopes "agent:snippets:*"))
    (is (contains? scopes "agent:search"))))

(deftest ^:parallel perms->scopes-nql-test
  (let [scopes (scope/user-metabot-perms->scopes {:permission/metabot-nlq :yes})]
    (is (contains? scopes "agent:notebook:*"))
    (is (contains? scopes "agent:query:*"))
    (is (contains? scopes "agent:table:*"))
    (is (contains? scopes "agent:metric:*"))))

(deftest ^:parallel perms->scopes-other-tools-test
  (let [scopes (scope/user-metabot-perms->scopes {:permission/metabot-other-tools :yes})]
    (is (contains? scopes "agent:viz:*"))
    (is (contains? scopes "agent:dashboard:*"))
    (is (contains? scopes "agent:document:*"))
    (is (contains? scopes "agent:alert:*"))))

(deftest ^:parallel perms->scopes-no-does-not-grant-test
  (let [scopes (scope/user-metabot-perms->scopes {:permission/metabot-sql-generation :no
                                                  :permission/metabot-nlq            :no})]
    (is (not (contains? scopes "agent:sql:*")))
    (is (not (contains? scopes "agent:notebook:*")))
    (is (contains? scopes "agent:search"))))

(deftest ^:parallel perms->scopes-all-yes-test
  (let [scopes (scope/user-metabot-perms->scopes scope/all-yes-permissions)]
    (is (contains? scopes "agent:sql:*"))
    (is (contains? scopes "agent:notebook:*"))
    (is (contains? scopes "agent:viz:*"))))

;;; ──────────────────────────────────────────────────────────────────
;;; Scope registry
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel defscope-vars-test
  (testing "defscope vars are bound to their scope strings"
    (is (= "agent:sql:create" scope/agent-sql-create))
    (is (= "agent:viz:read" scope/agent-viz-read))
    (is (= "agent:search" scope/agent-search))))

(deftest ^:parallel registered-scope?-test
  (testing "registered scopes return true"
    (is (api-scope/registered-scope? "agent:sql:create"))
    (is (api-scope/registered-scope? "agent:search"))
    (is (api-scope/registered-scope? "agent:viz:edit")))
  (testing "unregistered scopes return false"
    (is (not (api-scope/registered-scope? "agent:nonexistent:scope")))
    (is (not (api-scope/registered-scope? "agent:sql:*")))
    (is (not (api-scope/registered-scope? "")))))

(deftest ^:parallel all-scopes-test
  (testing "all-scopes returns a non-empty collection of maps"
    (let [scopes (api-scope/all-scopes)]
      (is (pos? (count scopes)))
      (is (every? #(contains? % :scope) scopes))
      (is (every? #(contains? % :description) scopes))
      (is (every? #(string? (:scope %)) scopes))))
  (testing "all-scopes includes known scopes"
    (let [scope-strings (set (map :scope (api-scope/all-scopes)))]
      (is (contains? scope-strings "agent:sql:create"))
      (is (contains? scope-strings "agent:search"))
      (is (contains? scope-strings "agent:viz:read")))))

(deftest ^:parallel scope-description-test
  (testing "returns description for registered scope"
    (is (some? (api-scope/scope-description "agent:sql:create"))))
  (testing "returns nil for unregistered scope"
    (is (nil? (api-scope/scope-description "agent:nonexistent:scope")))))

;;; ──────────────────────────────────────────────────────────────────
;;; parse-scopes
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel parse-scopes-space-delimited-test
  (is (= #{"agent:sql:create" "agent:search"} (api-scope/parse-scopes "agent:sql:create agent:search"))))

(deftest ^:parallel parse-scopes-single-scope-test
  (is (= #{"agent:search"} (api-scope/parse-scopes "agent:search"))))

(deftest ^:parallel parse-scopes-trims-whitespace-test
  (is (= #{"agent:search"} (api-scope/parse-scopes "  agent:search  "))))

(deftest ^:parallel parse-scopes-multiple-spaces-test
  (is (= #{"a" "b"} (api-scope/parse-scopes "a   b"))))

(deftest ^:parallel parse-scopes-nil-test
  (is (nil? (api-scope/parse-scopes nil))))

(deftest ^:parallel parse-scopes-blank-string-test
  (is (nil? (api-scope/parse-scopes "")))
  (is (nil? (api-scope/parse-scopes "   "))))

(deftest ^:parallel parse-scopes-non-string-test
  (is (nil? (api-scope/parse-scopes 42))))

;;; ──────────────────────────────────────────────────────────────────
;;; validate-tool-var! rejects unregistered scopes
;;; ──────────────────────────────────────────────────────────────────

(defn- make-tool-var!
  "Create a var with tool metadata for testing validate-tool-var!."
  [sym tool-meta]
  (let [v (intern *ns* sym (fn [_] nil))]
    (alter-meta! v merge tool-meta)
    v))

(deftest validate-tool-var-rejects-unregistered-scope-test
  (let [validate! @(resolve 'metabase.metabot.agent.profiles/validate-tool-var!)]
    (testing "tool with registered scope passes validation"
      (let [v (make-tool-var! 'test-ok-tool {:tool-name "ok" :schema [:=> [:cat :map] :map] :scope "agent:sql:create"})]
        (is (true? (validate! v)))))
    (testing "tool with unregistered scope throws"
      (let [v (make-tool-var! 'test-bad-tool {:tool-name "bad" :schema [:=> [:cat :map] :map] :scope "agent:bogus:scope"})]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"unregistered scope" (validate! v)))))
    (testing "tool without scope passes validation"
      (let [v (make-tool-var! 'test-legacy-tool {:tool-name "legacy" :schema [:=> [:cat :map] :map]})]
        (is (true? (validate! v)))))))
