(ns metabase.mcp.v2.registry-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.settings :as mcp.settings]
   ;; Registers the placeholder `ping_v2` tool the assertions below drive.
   [metabase.mcp.v2.api :as v2.api]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(comment v2.api/keep-me)

;; not ^:parallel: the kondo deftest lint treats the `!` suffix of `register-tool!` as destructive
(deftest registration-requires-scope-test
  (testing "a tool definition without a :scope fails loudly at registration"
    (is (thrown-with-msg? Exception #":scope"
                          (registry/register-tool! {:name        "no_scope"
                                                    :description "x"
                                                    :args        [:map]
                                                    :handler     (fn [_ _] nil)})))))

(deftest ^:parallel list-tools-scope-filtering-test
  (testing "tools/list filters on token scopes"
    (is (some #(= "ping_v2" (:name %)) (registry/list-tools #{"agent:search"})))
    (is (not (some #(= "ping_v2" (:name %)) (registry/list-tools #{"agent:metadata:read"})))))
  (testing "the unrestricted sentinel (cookie sessions) sees every tool"
    (is (some #(= "ping_v2" (:name %)) (registry/list-tools #{::scope/unrestricted})))))

(deftest ^:parallel call-tool-scope-check-test
  (testing "tools/call re-checks scope even for a tool that exists"
    (let [result (registry/call-tool #{"agent:metadata:read"} nil "ping_v2" {})]
      (is (:isError result))
      (is (= "Insufficient scope to call tool: ping_v2" (-> result :content first :text))))))

(deftest ^:parallel call-tool-success-test
  (testing "a valid call dispatches to the handler; top-level nils are stripped first"
    (let [result (registry/call-tool #{"agent:search"} nil "ping_v2" {:message nil})]
      (is (not (:isError result)))
      (is (= {:ok true :message "pong"} (:structuredContent result)))
      (testing "the internal error-code marker never reaches the client"
        (is (not (contains? result ::common/error-code)))))))

(deftest ^:parallel call-tool-validation-test
  (testing "malli validation failures surface as teaching errors"
    (let [result (registry/call-tool nil nil "ping_v2" {:message 42})]
      (is (:isError result))
      (is (str/starts-with? (-> result :content first :text) "Invalid arguments"))))
  (testing "non-object arguments are invalid params, not an internal error"
    (let [result (registry/call-tool nil nil "ping_v2" [1 2 3])]
      (is (:isError result))
      (is (= "Invalid arguments: expected a JSON object." (-> result :content first :text))))))

(deftest ^:parallel call-tool-teaching-error-test
  (testing "a handler's teaching error surfaces its message, not a stack trace"
    (mt/with-dynamic-fn-redefs [v2.api/ping-v2 (fn [_ _]
                                                 (common/throw-teaching-error "Use `fields` OR `response_format`, not both."))]
      (let [result (registry/call-tool nil nil "ping_v2" {})]
        (is (:isError result))
        (is (= "Use `fields` OR `response_format`, not both." (-> result :content first :text)))))))

(deftest disabled-tools-test
  (mt/with-temporary-setting-values [mcp.settings/mcp-v2-disabled-tools ["ping_v2"]]
    (testing "a disabled tool is hidden from tools/list"
      (is (not (some #(= "ping_v2" (:name %)) (registry/list-tools nil)))))
    (testing "and rejected by tools/call as unknown"
      (let [result (registry/call-tool nil nil "ping_v2" {})]
        (is (:isError result))
        (is (= "Unknown tool: ping_v2" (-> result :content first :text)))))))

(deftest ^:parallel registered-scopes-test
  (testing "every registered tool's scope flows through registered-scopes into the OAuth surface"
    (is (set/subset? #{"agent:search"} (set (registry/registered-scopes))))))

(deftest ^:parallel tools-hash-test
  (testing "tools-hash is a stable 8-char hex string that reflects scope-visible tools"
    (is (re-matches #"[0-9a-f]{8}" (registry/tools-hash nil)))
    (is (= (registry/tools-hash nil) (registry/tools-hash nil)))
    (is (not= (registry/tools-hash nil) (registry/tools-hash #{"agent:metadata:read"})))))
