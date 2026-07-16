(ns metabase.mcp.v2.registry-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.usage :as mcp.usage]
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

(defn- capture-usage-records
  "Run `thunk` with `record-mcp-tool-call!` redefed to capture its arg maps into a vector,
   which is returned. Lets the usage-logging contract be asserted without the EE DB writer."
  [thunk]
  (let [records (atom [])]
    (with-redefs [mcp.usage/record-mcp-tool-call! (fn [m] (swap! records conj m))]
      (thunk))
    @records))

;; not ^:parallel: with-redefs on the shared usage var
(deftest usage-logging-contract-test
  (testing "every tools/call outcome writes exactly one usage record with the right status/error-code"
    (testing "success → status \"success\", no error"
      (let [records (capture-usage-records #(registry/call-tool #{"agent:search"} nil "ping_v2" {}))]
        (is (= 1 (count records)))
        (let [r (first records)]
          (is (= "ping_v2" (:tool-name r)))
          (is (= "success" (:status r)))
          (is (nil? (:error-code r)))
          (is (nil? (:error-message r))))))
    (testing "scope denied → status \"error\", invalid-request code"
      (let [records (capture-usage-records #(registry/call-tool #{"agent:metadata:read"} nil "ping_v2" {}))]
        (is (= 1 (count records)))
        (let [r (first records)]
          (is (= "ping_v2" (:tool-name r)))
          (is (= "error" (:status r)))
          (is (= common/error-code-invalid-request (:error-code r)))
          (is (= "Insufficient scope to call tool: ping_v2" (:error-message r))))))
    (testing "unknown tool → status \"error\", method-not-found code"
      (let [records (capture-usage-records #(registry/call-tool nil nil "does_not_exist" {}))]
        (is (= 1 (count records)))
        (let [r (first records)]
          (is (= "does_not_exist" (:tool-name r)))
          (is (= "error" (:status r)))
          (is (= common/error-code-method-not-found (:error-code r)))
          (is (= "Unknown tool: does_not_exist" (:error-message r))))))
    (testing "validation failure → status \"error\", invalid-params code"
      (let [records (capture-usage-records #(registry/call-tool #{"agent:search"} nil "ping_v2" {:message 42}))]
        (is (= 1 (count records)))
        (let [r (first records)]
          (is (= "ping_v2" (:tool-name r)))
          (is (= "error" (:status r)))
          (is (= common/error-code-invalid-params (:error-code r)))
          (is (some? (:error-message r))))))))

;; not ^:parallel: registers/unregisters a throwaway tool in the shared registry atom
(deftest feature-gated-tool-test
  (testing "an EE :feature hides the tool from list/call when absent, exposes it when present"
    (let [tool-name "throwaway_feature_tool"
          tool      {:name        tool-name
                     :scope       "agent:search"
                     :feature     :content-verification
                     :description "throwaway feature-gated tool"
                     :args        [:map]
                     :handler     (fn [_ _] (common/success-content "ok"))}]
      (try
        (registry/register-tool! tool)
        (testing "feature absent → hidden from tools/list and rejected by tools/call as unknown"
          (mt/with-premium-features #{}
            (is (not (some #(= tool-name (:name %)) (registry/list-tools #{"agent:search"}))))
            (let [result (registry/call-tool #{"agent:search"} nil tool-name {})]
              (is (:isError result))
              (is (= (str "Unknown tool: " tool-name) (-> result :content first :text))))))
        (testing "feature present → visible in tools/list and callable"
          (mt/with-premium-features #{:content-verification}
            (is (some #(= tool-name (:name %)) (registry/list-tools #{"agent:search"})))
            (let [result (registry/call-tool #{"agent:search"} nil tool-name {})]
              (is (not (:isError result))))))
        (finally
          (swap! @#'registry/tools* dissoc tool-name)
          (reset! @#'registry/manifest-cache nil)))
      (testing "cleanup removed the throwaway tool"
        (is (not (some #(= tool-name (:name %)) (registry/list-tools #{"agent:search"}))))))))

;; not ^:parallel: exercises register-tool!'s load-time guards
(deftest registration-validation-test
  (testing "a blank :name fails loudly"
    (is (thrown-with-msg? Exception #":name"
                          (registry/register-tool! {:name        ""
                                                    :scope       "agent:search"
                                                    :description "x"
                                                    :args        [:map]
                                                    :handler     (fn [_ _] nil)}))))
  (testing "a missing :description fails loudly"
    (is (thrown-with-msg? Exception #"without a :description"
                          (registry/register-tool! {:name        "no_desc"
                                                    :scope       "agent:search"
                                                    :args        [:map]
                                                    :handler     (fn [_ _] nil)}))))
  (testing "a missing :args schema fails loudly"
    (is (thrown-with-msg? Exception #":args Malli schema"
                          (registry/register-tool! {:name        "no_args"
                                                    :scope       "agent:search"
                                                    :description "x"
                                                    :handler     (fn [_ _] nil)}))))
  (testing "a non-fn :handler fails loudly"
    (is (thrown-with-msg? Exception #":handler fn"
                          (registry/register-tool! {:name        "bad_handler"
                                                    :scope       "agent:search"
                                                    :description "x"
                                                    :args        [:map]
                                                    :handler     "not-a-fn"}))))
  (testing "an optional non-nullable field fails the strict-tool nullability check"
    (is (thrown-with-msg? Exception #"optional non-nullable field"
                          (registry/register-tool! {:name        "bad_schema"
                                                    :scope       "agent:search"
                                                    :description "x"
                                                    :args        [:map [:x {:optional true} :string]]
                                                    :handler     (fn [_ _] nil)})))))
