(ns metabase.metabot.agent.scope-enforcement-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.api-scope.core :as api-scope]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools :as tools]
   [metabase.util.malli :as mu]))

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
;;; Tool invocation scope check (in the runtime, from the declaration)
;;; ──────────────────────────────────────────────────────────────────

(mu/defn ^{:tool-name "scoped_test_tool"
           :scope     "agent:sql:create"}
  scoped-test-tool
  "A tool that requires a scope."
  [_args :- [:map {:closed true}]]
  {:output "success"})

(mu/defn ^{:tool-name "unscoped_test_tool"}
  unscoped-test-tool
  "A tool that requires no scope."
  [_args :- [:map {:closed true}]]
  {:output "no-scope-tool"})

(defn- call-tool
  [tool-var tool-name]
  ((get-in (tools/->entries [tool-var] (atom {}) nil :sql) [tool-name :fn]) {}))

(deftest ^:parallel tool-scope-enforcement-test
  (doseq [[label granted] {"unrestricted"  api-scope/unrestricted
                           "wildcard"      #{"agent:sql:*"}
                           "exact"         #{"agent:sql:create"}}]
    (testing (str "the tool runs with a " label " scope")
      (binding [scope/*current-user-scope* granted]
        (is (= {:output "success"} (call-tool #'scoped-test-tool "scoped_test_tool"))))))
  (testing "a denial is unrecoverable: the agent cannot acquire a scope, so the turn ends"
    (doseq [[label granted] {"no scope"    #{}
                             "wrong scope" #{"agent:notebook:*"}}]
      (testing label
        (binding [scope/*current-user-scope* granted]
          (let [outcome (call-tool #'scoped-test-tool "scoped_test_tool")]
            (is (= :unrecoverable (get-in outcome [:error :class])))
            (is (= :scope-denied (get-in outcome [:error :code])))
            (testing "the user is told which tool, and the scope string is not leaked"
              (is (re-find #"permission to use the scoped_test_tool tool"
                           (get-in outcome [:error :user-message])))
              (is (not (re-find #"agent:sql" (get-in outcome [:error :user-message])))))
            (testing "and the model is told only that it failed"
              (is (re-find #"Don't retry it" (:output outcome)))
              (is (not (re-find #"agent:sql" (:output outcome)))))))))))

(deftest ^:parallel tool-without-a-scope-always-runs-test
  (doseq [granted [#{} api-scope/unrestricted]]
    (binding [scope/*current-user-scope* granted]
      (is (= {:output "no-scope-tool"}
             (call-tool #'unscoped-test-tool "unscoped_test_tool"))))))

(deftest ^:parallel default-scope-is-empty-test
  (testing "*current-user-scope* defaults to empty set — denies all scoped tools"
    (is (= #{} scope/*current-user-scope*))
    (is (not (api-scope/scope-matches? scope/*current-user-scope* "agent:sql:create")))))
