(ns metabase.mcp.v2.registry-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.usage :as mcp.usage]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.test-util :as v2.tu]
   [metabase.mcp.v2.tools.query]
   [metabase.mcp.v2.tools.search]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;; not ^:parallel: the kondo deftest lint treats the `!` suffix of `register-tool!` as destructive
(deftest registration-requires-scope-test
  (testing "a tool definition without a :scope fails loudly at registration"
    (is (thrown-with-msg? Exception #":scope"
                          (registry/register-tool! {:name        "no_scope"
                                                    :description "x"
                                                    :args        [:map]
                                                    :handler     (fn [_ _] nil)}))))
  (testing "a set-valued :scope is rejected too — `:scope` is a single string, even though `mcp.scope/matches?`
            would honor a set, because `registered-scopes` would otherwise collect the set itself rather than
            its members"
    (is (thrown-with-msg? Exception #"registered without a :scope string"
                          (registry/register-tool! {:name        "set_scope_probe"
                                                    :scope       #{"agent:content:read" "agent:query:run"}
                                                    :description "probe: never registers"
                                                    :args        [:map]
                                                    :handler     (fn [_ _] nil)})))))

(deftest ^:parallel call-tool-scope-check-test
  (testing "tools/call re-checks scope even for a tool that exists"
    (let [{:keys [error]} (registry/call-tool #{"agent:metadata:read"} nil "test_echo" {})]
      (is (= common/error-code-invalid-request (:code error)))
      (is (= (str "Insufficient scope to call tool: test_echo. Requires "
                  (:scope (get @@#'registry/tools* "test_echo"))
                  "; your token holds agent:metadata:read.")
             (:message error))))
    (testing "GHY-4543: and names the scope to step up for, with a description the transport's 403 challenge carries"
      (let [{:keys [error]} (registry/call-tool #{"agent:metadata:read"} nil "test_echo" {})]
        (is (= {:required-scope "agent:content:read"
                :description    (str "test_echo requires agent:content:read "
                                     "(" (registry/english-scope-label "agent:content:read") ")")}
               (:insufficient-scope error)))))))

(deftest ^:parallel call-tool-in-handler-scope-denial-test
  (testing "GHY-4543: a handler's own scope check — a deferred action needing a scope beyond the tool's — is a scope
            denial like the registry gate's, not an `isError` result, so the transport can answer it with a 403"
    (mt/with-dynamic-fn-redefs [v2.tu/test-echo (fn [_ _]
                                                  (throw (ex-info "Doing that requires the agent:query:run scope."
                                                                  {:status-code          403
                                                                   ::common/error-code   common/error-code-invalid-request
                                                                   ::common/required-scope "agent:query:run"})))]
      (let [records (atom [])
            outcome (mt/with-dynamic-fn-redefs [mcp.usage/record-mcp-tool-call! #(swap! records conj %)]
                      (registry/call-tool #{"agent:content:read"} nil "test_echo" {}))]
        (is (not (contains? outcome :result)))
        (is (= {:code               common/error-code-invalid-request
                :message            "Doing that requires the agent:query:run scope."
                :insufficient-scope {:required-scope "agent:query:run"
                                     :description    (str "test_echo requires agent:query:run ("
                                                          (registry/english-scope-label "agent:query:run") ")")}}
               (:error outcome)))
        (testing "and is logged as an error"
          (is (= [["error" common/error-code-invalid-request]]
                 (map (juxt :status :error-code) @records))))))))

(deftest ^:parallel call-tool-success-test
  (testing "a valid call dispatches to the handler; top-level nils are stripped first"
    (let [{:keys [result]} (registry/call-tool #{"agent:content:read"} nil "test_echo" {:message nil})]
      (is (not (:isError result)))
      (is (= {:ok true :message "pong"} (:structuredContent result)))
      (testing "the internal error-code marker never reaches the client"
        (is (not (contains? result ::common/error-code)))))))

(deftest ^:parallel call-tool-validation-test
  (testing "malli validation failures surface as JSON-RPC invalid-params errors"
    (let [{:keys [error]} (registry/call-tool nil nil "test_echo" {:message 42})]
      (is (= common/error-code-invalid-params (:code error)))
      (is (str/starts-with? (:message error) "Invalid arguments"))))
  (testing "non-object arguments are invalid params, not an internal error"
    (let [{:keys [error]} (registry/call-tool nil nil "test_echo" [1 2 3])]
      (is (= {:code common/error-code-invalid-params
              :message "Invalid arguments: expected a JSON object."}
             error)))))

(deftest ^:parallel call-tool-teaching-error-test
  (testing "a handler's teaching error surfaces its message, not a stack trace"
    (mt/with-dynamic-fn-redefs [v2.tu/test-echo (fn [_ _]
                                                  (common/throw-teaching-error "Use `fields` OR `response_format`, not both."))]
      (let [{:keys [result]} (registry/call-tool nil nil "test_echo" {})]
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
        (mt/with-dynamic-fn-redefs [v2.tu/test-echo (fn [_ _] (throw thrown))]
          (let [{:keys [result]} (registry/call-tool #{"agent:content:read"} nil "test_echo" {})]
            (is (:isError result))
            (is (= "Internal error" (-> result :content first :text))
                "the raw exception message must not reach the client")))))))

(deftest disabled-tools-test
  (mt/with-temporary-setting-values [mcp.settings/mcp-v2-disabled-tools ["test_echo"]]
    (testing "a disabled tool is hidden from tools/list"
      (is (not (some #(= "test_echo" (:name %)) (registry/list-tools)))))
    (testing "and rejected by tools/call as unknown"
      (let [{:keys [error]} (registry/call-tool nil nil "test_echo" {})]
        (is (= {:code common/error-code-method-not-found
                :message "Unknown tool: test_echo"}
               error))))))

(deftest ^:parallel registered-scopes-test
  (testing "registered-scopes reports the scopes of the landed tools. (It does not feed the DCR grant: that reads
            `mcp.paths/v2-surface-scopes`, and a tool whose :scope is outside that set is unreachable over OAuth
            — which the containment below guards.)"
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

;; not ^:parallel: changes a setting
(deftest tools-hash-test
  (testing "tools-hash is a stable 8-char hex string"
    (is (re-matches #"[0-9a-f]{8}" (registry/tools-hash)))
    (is (= (registry/tools-hash) (registry/tools-hash))))
  (testing "it changes when the listed tool set does"
    (let [before (registry/tools-hash)]
      (mt/with-temporary-setting-values [mcp.settings/mcp-v2-disabled-tools ["test_echo"]]
        (is (not= before (registry/tools-hash)))))))

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
      (let [records (capture-usage-records! #(registry/call-tool #{"agent:content:read"} nil "test_echo" {}))]
        (is (= 1 (count records)))
        (let [r (first records)]
          (is (= "test_echo" (:tool-name r)))
          (is (= "success" (:status r)))
          (is (nil? (:error-code r)))
          (is (nil? (:error-message r))))))
    (testing "scope denied → status \"error\", invalid-request code"
      (let [records (capture-usage-records! #(registry/call-tool #{"agent:metadata:read"} nil "test_echo" {}))]
        (is (= 1 (count records)))
        (let [r (first records)]
          (is (= "test_echo" (:tool-name r)))
          (is (= "error" (:status r)))
          (is (= common/error-code-invalid-request (:error-code r)))
          (is (str/starts-with? (:error-message r) "Insufficient scope to call tool: test_echo.")))))
    (testing "unknown tool → status \"error\", method-not-found code"
      (let [records (capture-usage-records! #(registry/call-tool nil nil "does_not_exist" {}))]
        (is (= 1 (count records)))
        (let [r (first records)]
          (is (= "does_not_exist" (:tool-name r)))
          (is (= "error" (:status r)))
          (is (= common/error-code-method-not-found (:error-code r)))
          (is (= "Unknown tool: does_not_exist" (:error-message r))))))
    (testing "validation failure → status \"error\", invalid-params code"
      (let [records (capture-usage-records! #(registry/call-tool #{"agent:content:read"} nil "test_echo" {:message 42}))]
        (is (= 1 (count records)))
        (let [r (first records)]
          (is (= "test_echo" (:tool-name r)))
          (is (= "error" (:status r)))
          (is (= common/error-code-invalid-params (:error-code r)))
          (is (some? (:error-message r))))))))

;; not ^:parallel: re-registers a tool in the shared registry
(deftest registration-survives-a-namespace-reload-test
  (testing "the same-name guard compares the handler var's fully-qualified symbol, not the var object: a
            tools.namespace reload re-interns the same symbol (accepted), while a same-named var from a
            different namespace is a genuinely different handler (refused)"
    (let [existing (get @@#'registry/tools* "test_echo")
          handler  (:handler existing)
          ;; What a namespace reload leaves behind: a different var object carrying the same
          ;; fully-qualified name. Built in a throwaway namespace so the live handler is untouched.
          reload-ns (create-ns (gensym "mcp-reload-probe"))
          reloaded  (intern reload-ns (:name (meta handler)) @handler)]
      (try
        (is (not (identical? reloaded handler)) "the probe must really be a different var")
        (is (= (:name (meta handler)) (:name (meta reloaded))))
        (is (thrown-with-msg? Exception #"already registered"
                              (registry/register-tool! (assoc existing :handler reloaded)))
            "a same-NAMED var from another namespace is still a different handler and is refused")
        (is (= "test_echo" (registry/register-tool! existing))
            "and the genuine handler var re-registers cleanly")
        (finally
          (remove-ns (ns-name reload-ns))
          (registry/register-tool! (assoc existing :handler handler)))))))

;; not ^:parallel: exercises register-tool!'s load-time guards
(deftest registration-validates-extensions-test
  (testing "an unknown option key fails loudly — a misspelled :required-extensions would silently disable the gate"
    (is (thrown-with-msg? Exception #"unknown option"
                          (registry/register-tool! {:name               "typo_key"
                                                    :scope              "agent:content:read"
                                                    :description        "x"
                                                    :args               [:map]
                                                    :handler            (fn [_ _] nil)
                                                    :require-extensions #{:mcp-app-ui}}))))
  (testing ":required-extensions must be a set of keywords"
    (is (thrown-with-msg? Exception #"set of keywords"
                          (registry/register-tool! {:name                "bad_extensions"
                                                    :scope               "agent:content:read"
                                                    :description         "x"
                                                    :args                [:map]
                                                    :handler             (fn [_ _] nil)
                                                    :required-extensions ["mcp-app-ui"]}))))
  (testing "a required extension no client can advertise fails loudly — it would hide the tool from everyone"
    (is (thrown-with-msg? Exception #"unknown client extension"
                          (registry/register-tool! {:name                "unknown_extension"
                                                    :scope               "agent:content:read"
                                                    :description         "x"
                                                    :args                [:map]
                                                    :handler             (fn [_ _] nil)
                                                    :required-extensions #{:mcp-app-holodeck}})))))

;; not ^:parallel: re-registers a tool in the shared registry
(deftest registration-rejects-a-name-claimed-by-another-handler-test
  (testing "a second definition claiming a registered name fails loudly, so load order cannot decide which
            handler `tools/call` reaches; the registered handler itself re-registers cleanly"
    (let [existing (get @@#'registry/tools* "test_echo")]
      (is (some? existing) "test_echo must be registered for this to prove anything")
      (is (thrown-with-msg? Exception #"already registered"
                            (registry/register-tool! (assoc existing :handler (fn [_ _] nil)))))
      (is (= "test_echo" (registry/register-tool! existing))))))

;; not ^:parallel: exercises register-tool!'s load-time guards
(deftest registration-validates-required-fields-test
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
         (is (false? (->> (registry/list-tools)
                          (filter #(= "annotation_free_mutator" (:name %)))
                          first
                          :annotations
                          :readOnlyHint))))
       (testing "so the enumeration the invariants run over must see it too"
         (is (contains? (set (keys (mutating-tools))) "annotation_free_mutator")))
       (testing "and it carries the :scope the invariants check, so they can actually run on it"
         (is (= "agent:content:read" (:scope (get (mutating-tools) "annotation_free_mutator")))))))))

;; not ^:parallel: registers throwaway tools and changes a setting
(deftest list-tools-shows-tools-the-token-cannot-call-test
  (testing "GHY-4543: tools/list takes no token scopes, so a tool gated on each write scope is listed — a client can
            only attempt, and then step up for, a tool it can see — and a token holding only `agent:content:read` is
            refused when it calls one"
    (doseq [scope (sort write-scopes)
            :let  [tool-name (str "scope_probe_" (str/replace scope #"\W" "_"))]]
      (testing scope
        (do-with-temp-tool!
         {:name        tool-name
          :scope       scope
          :description "test-only tool gated on a scope the token lacks"
          :args        [:map]
          :handler     (fn [_ _] nil)}
         (fn []
           (is (contains? (set (map :name (registry/list-tools))) tool-name))
           (is (str/starts-with? (-> (registry/call-tool #{"agent:content:read"} nil tool-name {}) :error :message)
                                 (str "Insufficient scope to call tool: " tool-name "."))))))))
  (testing "GHY-4543: the non-scope filters still hide tools"
    (testing "a disabled tool"
      (mt/with-temporary-setting-values [mcp.settings/mcp-v2-disabled-tools ["test_echo"]]
        (is (not (contains? (set (map :name (registry/list-tools))) "test_echo")))))
    (testing "a tool needing a client extension the caller lacks"
      (do-with-temp-tool!
       {:name                "ui_probe"
        :scope               "agent:content:read"
        :description         "test-only tool that needs MCP Apps UI"
        :args                [:map]
        :handler             (fn [_ _] nil)
        :required-extensions #{:mcp-app-ui}}
       (fn []
         (let [names (fn [options] (set (map :name (registry/list-tools options))))]
           (is (contains? (names {:supports-mcp-ui? true}) "ui_probe"))
           (is (not (contains? (names {:supports-mcp-ui? false}) "ui_probe")))))))))

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
            (let [{:keys [error]} (registry/call-tool #{"agent:content:read"} nil tool-name {})]
              (is (= common/error-code-invalid-request (:code error)))
              (is (str/starts-with? (:message error)
                                    (str "Insufficient scope to call tool: " tool-name ".")))
              (testing "the message names the scope the tool wants and the ones the token holds —
                        naming only the tool leaves the caller nothing to act on"
                (is (str/includes? (:message error)
                                   (str "Requires " (:scope (get @@#'registry/tools* tool-name)))))
                (is (str/includes? (:message error) "your token holds agent:content:read."))))))))))

;;; ------------------------------------ Required permission in descriptions ---------------------------------------

(defn- published-descriptions
  "`{tool-name description}` as the manifest behind `tools/list` publishes them."
  []
  (into {} (map (juxt :name :description)) (@#'registry/manifest)))

(def ^:private test-echo-permission-text
  "Requires the \"See your Metabase content and data structure\" permission (agent:content:read).")

(deftest ^:parallel description-names-required-permission-test
  (testing "GHY-4543: clients hide a scope denial's error text from the model, so a scoped tool's description names
            the permission it needs — by its consent-screen label, which is what the user sees, and by scope string"
    (let [description (get (published-descriptions) "test_echo")]
      (is (str/starts-with? description (str test-echo-permission-text "\n\nTest-only tool. Echoes `message` back"))
          "the permission sentence comes first, then a blank line, then the tool's own description"))))

(def ^:private leading-permission-sentence
  "Matches a description that opens with its permission sentence and a blank line; groups are label and scope for a
  labelled scope, or the bare scope."
  #"\ARequires the (?:\"([^\"]+)\" permission \(([^)\s]+)\)|(\S+) permission)\.\n\n\S")

(deftest ^:parallel every-description-starts-with-its-required-permission-test
  (testing "GHY-4543: clients truncate long tool descriptions (Claude Code at 2048 characters), so every published
            description opens with the sentence naming its own tool's permission, where truncation can't reach it"
    (let [manifest (@#'registry/manifest)]
      (is (some #(= "execute_query" (:name %)) manifest))
      (doseq [{tool-name :name :keys [description scope]} manifest]
        (testing tool-name
          (let [[_ label labelled-scope bare-scope] (re-find leading-permission-sentence description)]
            (is (= scope (or labelled-scope bare-scope)))
            (is (= (registry/english-scope-label scope) label))))))))

;; not ^:parallel: flushes the shared manifest cache
(deftest description-permission-text-ignores-caller-locale-test
  (testing "GHY-4543: the manifest is cached once for every caller, so the permission text must not take the locale
            of whoever happened to list tools first — it is model-facing and stays English"
    (mt/with-mock-i18n-bundles! {"zz" {:messages {"See your Metabase content and data structure" "ZZ CONTENT READ"}}}
      (try
        (reset! @#'registry/manifest-cache nil)
        (mt/with-user-locale "zz"
          (testing "the mocked bundle really translates that label, or an English description proves nothing"
            (is (= "ZZ CONTENT READ" (str (api-scope/scope-description "agent:content:read")))))
          (is (str/starts-with? (get (published-descriptions) "test_echo") test-echo-permission-text)))
        (is (str/starts-with? (get (published-descriptions) "test_echo") test-echo-permission-text))
        (finally
          (reset! @#'registry/manifest-cache nil))))))

;; not ^:parallel: registers a throwaway tool
(deftest description-permission-text-without-registered-scope-description-test
  (testing "GHY-4543: a scope with no consent-screen label is named by its scope string alone"
    (do-with-temp-tool!
     {:name        "unlabelled_scope_probe"
      :scope       "agent:unlabelled:probe"
      :description "Probe."
      :args        [:map]
      :handler     (fn [_ _] nil)}
     (fn []
       (is (= "Requires the agent:unlabelled:probe permission.\n\nProbe."
              (get (published-descriptions) "unlabelled_scope_probe")))))))

;;; ------------------------------------------ Security schemes -----------------------------------------------------

(defn- published-security-schemes
  "`{tool-name securitySchemes}` as `tools/list` sends them over the wire (JSON, string keys)."
  []
  (into {}
        (map (juxt #(get % "name") #(get % "securitySchemes")))
        (json/decode (json/encode (registry/list-tools)))))

(deftest ^:parallel every-listed-tool-declares-its-scope-as-a-security-scheme-test
  (testing "GHY-4543: ChatGPT steps up only for the OAuth scopes a tool declares in `securitySchemes`; without them it
            re-authorizes for its login scope in a loop. Every listed tool declares exactly its own `:scope`."
    (let [published (published-security-schemes)]
      (is (seq published))
      (doseq [[tool-name schemes] published]
        (testing tool-name
          (is (= [{"type" "oauth2" "scopes" [(:scope (get @@#'registry/tools* tool-name))]}]
                 schemes)))))))

(deftest ^:parallel security-schemes-name-concrete-scopes-test
  (testing "GHY-4543: tools with different scopes declare different schemes, so the comparison above has teeth"
    (let [published (published-security-schemes)]
      (is (= [{"type" "oauth2" "scopes" ["agent:content:read"]}]
             (get published "test_echo")))
      (is (= [{"type" "oauth2" "scopes" ["agent:content:read"]}]
             (get published "search")))
      (is (= [{"type" "oauth2" "scopes" ["agent:sql:run"]}]
             (get published "execute_sql"))))))
