(ns metabase.metabot.agent.scope-enforcement-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.api-scope.core :as api-scope]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools :as tools]))

;;; ──────────────────────────────────────────────────────────────────
;;; Tool list filtering by scope (via profiles/filter-by-scope)
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel filter-by-scope-test
  (let [no-scope (with-meta (fn [_] {:output "legacy"})
                            {:tool-name "legacy" :schema [:=> [:cat :map] :map]})]

    (testing "with unrestricted scope, all tools pass"
      (binding [scope/*current-user-scope* api-scope/unrestricted]
        (is (api-scope/scope-matches? scope/*current-user-scope* "agent:sql:create"))
        (is (api-scope/scope-matches? scope/*current-user-scope* "agent:search"))))

    (testing "with empty scope, no scoped tools pass"
      (binding [scope/*current-user-scope* #{}]
        (is (not (api-scope/scope-matches? scope/*current-user-scope* "agent:sql:create")))
        (is (not (api-scope/scope-matches? scope/*current-user-scope* "agent:search")))))

    (testing "with wildcard scope, matching tools pass"
      (binding [scope/*current-user-scope* #{"agent:sql:*"}]
        (is (api-scope/scope-matches? scope/*current-user-scope* "agent:sql:create"))
        (is (not (api-scope/scope-matches? scope/*current-user-scope* "agent:search")))))

    (testing "tools without scope always pass"
      (binding [scope/*current-user-scope* #{}]
        (is (nil? (:scope (meta no-scope))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Tool invocation scope check (via wrap-tools-with-state)
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel wrapped-tool-scope-enforcement-test
  (let [tool-var    (with-meta (fn [_args] {:output "success"})
                               {:tool-name "test_tool"
                                :schema    [:=> [:cat :map] :map]
                                :scope     "agent:sql:create"})
        tools-map   {"test_tool" tool-var}
        memory-atom (atom {})
        wrapped     (tools/wrap-tools-with-state tools-map memory-atom nil)
        wrapped-fn  (get-in wrapped ["test_tool" :fn])]

    (testing "tool executes when scope is satisfied"
      (binding [scope/*current-user-scope* api-scope/unrestricted]
        (is (= {:output "success"} (wrapped-fn {})))))

    (testing "tool executes with matching wildcard scope"
      (binding [scope/*current-user-scope* #{"agent:sql:*"}]
        (is (= {:output "success"} (wrapped-fn {})))))

    (testing "tool executes with exact scope match"
      (binding [scope/*current-user-scope* #{"agent:sql:create"}]
        (is (= {:output "success"} (wrapped-fn {})))))

    (testing "tool returns denial when scope is not satisfied"
      (binding [scope/*current-user-scope* #{}]
        (let [result (wrapped-fn {})]
          (is (string? (:output result)))
          (is (re-find #"do not have permission" (:output result)))
          ;; scope string should NOT be leaked in the output
          (is (not (re-find #"agent:sql" (:output result)))))))

    (testing "tool returns denial with wrong scope"
      (binding [scope/*current-user-scope* #{"agent:notebook:*"}]
        (let [result (wrapped-fn {})]
          (is (re-find #"do not have permission" (:output result))))))))

(deftest ^:parallel wrapped-tool-no-scope-test
  (let [tool-var    (with-meta (fn [_args] {:output "no-scope-tool"})
                               {:tool-name "legacy_tool"
                                :schema    [:=> [:cat :map] :map]})
        tools-map   {"legacy_tool" tool-var}
        memory-atom (atom {})
        wrapped     (tools/wrap-tools-with-state tools-map memory-atom nil)
        wrapped-fn  (get-in wrapped ["legacy_tool" :fn])]

    (testing "tool without :scope always executes regardless of current scope"
      (binding [scope/*current-user-scope* #{}]
        (is (= {:output "no-scope-tool"} (wrapped-fn {}))))
      (binding [scope/*current-user-scope* api-scope/unrestricted]
        (is (= {:output "no-scope-tool"} (wrapped-fn {})))))))

(deftest ^:parallel default-scope-is-empty-test
  (testing "*current-user-scope* defaults to empty set — denies all scoped tools"
    (is (= #{} scope/*current-user-scope*))
    (is (not (api-scope/scope-matches? scope/*current-user-scope* "agent:sql:create")))))
