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
    (is (some #(= "ping_v2" (:name %)) (registry/list-tools #{"agent:content:read"})))
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
    (let [result (registry/call-tool #{"agent:content:read"} nil "ping_v2" {:message nil})]
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

(deftest ^:parallel call-tool-redacts-internal-errors-test
  (testing "GHY-4137: a handler's unexpected failure — a raw exception whose message may embed
            SQL, schema, or connection detail — is redacted to a generic internal error, never
            returned to the (possibly scope-limited) client"
    (doseq [[label thrown] [["raw runtime exception" (RuntimeException. "jdbc://user:hunter2@db.internal failed")]
                            ["JDBC SQLException"      (java.sql.SQLException. "relation \"secret_accounts\" does not exist")]
                            ["ex-info with no status" (ex-info "SELECT ssn FROM secret_accounts" {:query {}})]]]
      (testing label
        (mt/with-dynamic-fn-redefs [v2.api/ping-v2 (fn [_ _] (throw thrown))]
          (let [result (registry/call-tool #{"agent:content:read"} nil "ping_v2" {})]
            (is (:isError result))
            (is (= "Internal error" (-> result :content first :text))
                "the raw exception message must not reach the client")))))))

(deftest disabled-tools-test
  (mt/with-temporary-setting-values [mcp.settings/mcp-v2-disabled-tools ["ping_v2"]]
    (testing "a disabled tool is hidden from tools/list"
      (is (not (some #(= "ping_v2" (:name %)) (registry/list-tools nil)))))
    (testing "and rejected by tools/call as unknown"
      (let [result (registry/call-tool nil nil "ping_v2" {})]
        (is (:isError result))
        (is (= "Unknown tool: ping_v2" (-> result :content first :text)))))))

(deftest ^:parallel registered-scopes-test
  (testing "every registered tool's :scope flows through registered-scopes into the default DCR grant"
    (is (set/subset? #{"agent:content:read"} (set (registry/registered-scopes)))))
  ;; GHY-4225 retired :required-scopes from v2: duplicate_content's per-type create scopes all
  ;; collapsed into the single `agent:content:write` it already gates on, so there is no longer a
  ;; mandatory-but-separate scope to keep in the default grant.
  ;; While the surface is being rebuilt one tool per PR, only the scopes of the landed tools are
  ;; registered — so assert the containment in the direction that already holds: no tool sneaks in a
  ;; scope outside the rationalized five. The other direction ("all five reach the default grant")
  ;; comes back when the tool set reaches parity, at v1 retirement.
  (testing "every registered scope is one of the five rationalized scopes"
    (is (set/subset? (set (registry/registered-scopes))
                     #{"agent:content:read" "agent:content:write" "agent:query:run"
                       "agent:sql:run" "agent:delivery:write"}))))

(deftest ^:parallel tools-hash-test
  (testing "tools-hash is a stable 8-char hex string that reflects scope-visible tools"
    (is (re-matches #"[0-9a-f]{8}" (registry/tools-hash nil)))
    (is (= (registry/tools-hash nil) (registry/tools-hash nil)))
    (is (not= (registry/tools-hash nil) (registry/tools-hash #{"agent:metadata:read"})))))

(defn- capture-usage-records!
  "Run `thunk` with `record-mcp-tool-call!` redefed to capture its arg maps into a vector,
   which is returned. Lets the usage-logging contract be asserted without the EE DB writer."
  [thunk]
  (let [records (atom [])]
    (mt/with-dynamic-fn-redefs [mcp.usage/record-mcp-tool-call! (fn [m] (swap! records conj m))]
      (thunk))
    @records))

;; not ^:parallel: exercises shared registry/tool state alongside the usage redef
(deftest usage-logging-contract-test
  (testing "every tools/call outcome writes exactly one usage record with the right status/error-code"
    (testing "success → status \"success\", no error"
      (let [records (capture-usage-records! #(registry/call-tool #{"agent:content:read"} nil "ping_v2" {}))]
        (is (= 1 (count records)))
        (let [r (first records)]
          (is (= "ping_v2" (:tool-name r)))
          (is (= "success" (:status r)))
          (is (nil? (:error-code r)))
          (is (nil? (:error-message r))))))
    (testing "scope denied → status \"error\", invalid-request code"
      (let [records (capture-usage-records! #(registry/call-tool #{"agent:metadata:read"} nil "ping_v2" {}))]
        (is (= 1 (count records)))
        (let [r (first records)]
          (is (= "ping_v2" (:tool-name r)))
          (is (= "error" (:status r)))
          (is (= common/error-code-invalid-request (:error-code r)))
          (is (= "Insufficient scope to call tool: ping_v2" (:error-message r))))))
    (testing "unknown tool → status \"error\", method-not-found code"
      (let [records (capture-usage-records! #(registry/call-tool nil nil "does_not_exist" {}))]
        (is (= 1 (count records)))
        (let [r (first records)]
          (is (= "does_not_exist" (:tool-name r)))
          (is (= "error" (:status r)))
          (is (= common/error-code-method-not-found (:error-code r)))
          (is (= "Unknown tool: does_not_exist" (:error-message r))))))
    (testing "validation failure → status \"error\", invalid-params code"
      (let [records (capture-usage-records! #(registry/call-tool #{"agent:content:read"} nil "ping_v2" {:message 42}))]
        (is (= 1 (count records)))
        (let [r (first records)]
          (is (= "ping_v2" (:tool-name r)))
          (is (= "error" (:status r)))
          (is (= common/error-code-invalid-params (:error-code r)))
          (is (some? (:error-message r))))))))

;; not ^:parallel: exercises register-tool!'s load-time guards
(deftest registration-validation-test
  (testing "a blank :name fails loudly"
    (is (thrown-with-msg? Exception #":name"
                          (registry/register-tool! {:name        ""
                                                    :scope       "agent:content:read"
                                                    :description "x"
                                                    :args        [:map]
                                                    :handler     (fn [_ _] nil)}))))
  (testing "a missing :description fails loudly"
    (is (thrown-with-msg? Exception #"without a :description"
                          (registry/register-tool! {:name        "no_desc"
                                                    :scope       "agent:content:read"
                                                    :args        [:map]
                                                    :handler     (fn [_ _] nil)}))))
  (testing "a missing :args schema fails loudly"
    (is (thrown-with-msg? Exception #":args Malli schema"
                          (registry/register-tool! {:name        "no_args"
                                                    :scope       "agent:content:read"
                                                    :description "x"
                                                    :handler     (fn [_ _] nil)}))))
  (testing "a non-fn :handler fails loudly"
    (is (thrown-with-msg? Exception #":handler fn"
                          (registry/register-tool! {:name        "bad_handler"
                                                    :scope       "agent:content:read"
                                                    :description "x"
                                                    :args        [:map]
                                                    :handler     "not-a-fn"}))))
  (testing "an optional non-nullable field fails the strict-tool nullability check"
    (is (thrown-with-msg? Exception #"optional non-nullable field"
                          (registry/register-tool! {:name        "bad_schema"
                                                    :scope       "agent:content:read"
                                                    :description "x"
                                                    :args        [:map [:x {:optional true} :string]]
                                                    :handler     (fn [_ _] nil)})))))

;;; ------------------------------------- Write-tool scope invariants ----------------------------------------

(def ^:private write-scopes
  "The scopes a mutating tool may gate on. GHY-4225 collapsed the per-entity write scopes into
   `content:write` and `delivery:write`, so a mutating tool gating on anything else is a mistake
   until someone argues otherwise here.

   `sql:run` is the one such argument. `execute_sql` runs arbitrary SQL, which can write — but it is
   a sharper capability than editing content, and one a user should be able to withhold while still
   granting writes, so it keeps its own scope rather than folding into `content:write`."
  #{"agent:content:write" "agent:delivery:write" "agent:sql:run"})

(defn- do-with-temp-tool!
  "Register a throwaway tool for the body, then restore the registry and flush the manifest cache."
  [tool thunk]
  (let [tools-atom @#'registry/tools*
        snapshot   @tools-atom]
    (try
      (registry/register-tool! tool)
      (thunk)
      (finally
        (reset! tools-atom snapshot)
        (reset! @#'registry/manifest-cache nil)))))

(defn- mutating-tools
  "Registered tools that declare they mutate, as `{name tool}`. Enumerated from the registry rather
   than a hand-kept list, so a write tool landing tomorrow is covered the day it registers.

   Read from the MANIFEST, not from the raw registry entries: `:annotations` are defaulted at manifest
   time, so the raw entry for a tool that declared none carries no `:readOnlyHint` at all while clients
   are told `false`. See [[mutating-tools-sees-what-clients-see-test]]."
  []
  (into {}
        (comp (filter #(false? (get-in % [:annotations :readOnlyHint])))
              (map (juxt :name identity)))
        (@#'registry/manifest)))

;; not ^:parallel: registers a throwaway tool
(deftest mutating-tools-sees-what-clients-see-test
  (testing "GHY-4337: the three invariants below are only as good as this enumeration, and `default-annotations`
            supplies `:readOnlyHint false` at MANIFEST time rather than at registration. So a tool that declares
            no `:annotations` is published to clients as mutating while its raw registry entry carries no
            `:readOnlyHint` at all — and enumerating from the raw entry would skip exactly the tool these
            invariants exist to catch: one that mutates, says nothing about it, and rides a read scope."
    (do-with-temp-tool!
     {:name        "annotation_free_mutator"
      :scope       "agent:content:read"
      :description "test-only tool that declares no annotations at all"
      :args        [:map]
      :handler     (fn [_ _] nil)}
     (fn []
       (testing "clients are told it mutates"
         (is (false? (->> (registry/list-tools nil)
                          (filter #(= "annotation_free_mutator" (:name %)))
                          first
                          :annotations
                          :readOnlyHint))))
       (testing "so the enumeration the invariants run over must see it too"
         (is (contains? (set (keys (mutating-tools))) "annotation_free_mutator")))
       (testing "and it carries the :scope the invariants check, so they can actually run on it"
         (is (= "agent:content:read" (:scope (get (mutating-tools) "annotation_free_mutator")))))))))

(deftest write-tools-are-annotated-as-mutating-test
  (testing "a tool named `*_write` declares `:readOnlyHint false`. This guards the enumeration the
            two tests below depend on: a write tool that omitted the annotation would drop out of
            [[mutating-tools]] and silently lose its scope coverage rather than failing."
    (let [tools     @@#'registry/tools*
          mutating  (set (keys (mutating-tools)))
          by-name   (filter #(str/ends-with? % "_write") (keys tools))]
      ;; `when` rather than a hard `(is (seq by-name))` while the surface is rebuilt one tool per
      ;; PR: no write tool has landed yet, so vacuous is truthful. The guard regains teeth the day
      ;; the first `*_write` tool registers; restore the hard assertion at v1 retirement.
      (when (seq by-name)
        (doseq [tool-name (sort by-name)]
          (testing tool-name
            (is (contains? mutating tool-name))))))))

(deftest mutating-tools-gate-on-a-write-scope-test
  (testing "every mutating tool gates on one of the write scopes, so a token can be granted read
            access without also being able to change anything"
    ;; `when`-guarded during the tool-by-tool rebuild — see write-tools-are-annotated-as-mutating-test.
    (let [tools (mutating-tools)]
      (when (seq tools)
        (doseq [[tool-name tool] (sort-by key tools)]
          (testing tool-name
            (is (contains? write-scopes (:scope tool)))))))))

(deftest mutating-tools-refuse-a-read-only-token-test
  (testing "the declared scope is actually enforced: a token holding only `agent:content:read`
            cannot call any mutating tool. Asserted per tool rather than once on a placeholder,
            because the gate is only as good as each tool's own `:scope`, and checked at call time
            because being hidden from `tools/list` is a separate gate from being refused."
    ;; `when`-guarded during the tool-by-tool rebuild — see write-tools-are-annotated-as-mutating-test.
    (let [tools (mutating-tools)]
      (when (seq tools)
        (doseq [[tool-name _] (sort-by key tools)]
          (testing tool-name
            ;; `{}` suffices: the registry checks scope before it validates arguments, so a refusal
            ;; here can't be an argument error wearing a scope error's clothes.
            (let [result (registry/call-tool #{"agent:content:read"} nil tool-name {})]
              (is (:isError result))
              (is (= (str "Insufficient scope to call tool: " tool-name)
                     (-> result :content first :text))))))))))
