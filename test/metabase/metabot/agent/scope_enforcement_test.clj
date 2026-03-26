(ns metabase.metabot.agent.scope-enforcement-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools :as tools]))

;;; ──────────────────────────────────────────────────────────────────
;;; Helpers
;;; ──────────────────────────────────────────────────────────────────

(defn- make-tool-var
  "Create a fake tool var with the given metadata and function."
  [tool-name scope-str]
  (let [f  (fn [_args] {:output (str "ran " tool-name)})
        v  (with-meta (var-get #'identity) ;; need a real var for meta
                      {:tool-name tool-name
                       :schema    [:=> [:cat :map] :map]
                       :scope     scope-str})]
    v))

;;; ──────────────────────────────────────────────────────────────────
;;; Tool list filtering by scope (via profiles/filter-by-scope)
;;; ──────────────────────────────────────────────────────────────────

(deftest filter-by-scope-test
  (let [;; We test the filtering behavior through wrap-tools-with-state
        ;; since filter-by-scope is private. Instead, we test the scope
        ;; matching behavior that filter-by-scope relies on.
        sql-tool    (with-meta (fn [_] {:output "sql"})
                               {:tool-name "create_sql" :schema [:=> [:cat :map] :map] :scope "agent:sql:create"})
        search-tool (with-meta (fn [_] {:output "search"})
                               {:tool-name "search" :schema [:=> [:cat :map] :map] :scope "agent:search"})
        no-scope    (with-meta (fn [_] {:output "legacy"})
                               {:tool-name "legacy" :schema [:=> [:cat :map] :map]})]

    (testing "with unrestricted scope, all tools pass"
      (binding [scope/*current-user-scope* scope/unrestricted]
        (is (scope/scope-matches? scope/*current-user-scope* "agent:sql:create"))
        (is (scope/scope-matches? scope/*current-user-scope* "agent:search"))))

    (testing "with empty scope, no scoped tools pass"
      (binding [scope/*current-user-scope* #{}]
        (is (not (scope/scope-matches? scope/*current-user-scope* "agent:sql:create")))
        (is (not (scope/scope-matches? scope/*current-user-scope* "agent:search")))))

    (testing "with wildcard scope, matching tools pass"
      (binding [scope/*current-user-scope* #{"agent:sql:*"}]
        (is (scope/scope-matches? scope/*current-user-scope* "agent:sql:create"))
        (is (not (scope/scope-matches? scope/*current-user-scope* "agent:search")))))

    (testing "tools without scope always pass"
      (binding [scope/*current-user-scope* #{}]
        (is (nil? (:scope (meta no-scope))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Tool invocation scope check (via wrap-tools-with-state)
;;; ──────────────────────────────────────────────────────────────────

(deftest wrapped-tool-scope-enforcement-test
  (let [tool-var    (with-meta (fn [_args] {:output "success"})
                               {:tool-name "test_tool"
                                :schema    [:=> [:cat :map] :map]
                                :scope     "agent:sql:create"})
        tools-map   {"test_tool" tool-var}
        memory-atom (atom {})
        wrapped     (tools/wrap-tools-with-state tools-map memory-atom nil)
        wrapped-fn  (get-in wrapped ["test_tool" :fn])]

    (testing "tool executes when scope is satisfied"
      (binding [scope/*current-user-scope* scope/unrestricted]
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

(deftest wrapped-tool-no-scope-test
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
      (binding [scope/*current-user-scope* scope/unrestricted]
        (is (= {:output "no-scope-tool"} (wrapped-fn {})))))))

(deftest default-scope-is-empty-test
  (testing "*current-user-scope* defaults to empty set — denies all scoped tools"
    (is (= #{} scope/*current-user-scope*))
    (is (not (scope/scope-matches? scope/*current-user-scope* "agent:sql:create")))))
