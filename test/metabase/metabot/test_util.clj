(ns metabase.metabot.test-util
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Fixture capture / cache
;;; ──────────────────────────────────────────────────────────────────

(def ^:private fixture-dir "test_resources/llm")

(def ^:dynamic *live*
  "When true, `raw-fixture` makes real API calls even if a cached file exists.
  Bind to `true` in the REPL to re-capture all fixtures:

    (binding [test-util/*live* true]
      (run-tests))

  Or set the env var `MB_TEST_LLM_LIVE=true` before running tests."
  (= "true" (System/getenv "MB_TEST_LLM_LIVE")))

(defn raw-fixture
  "Load raw LLM chunks from a cached JSON file, or call the API and cache the result.

  `fixture-name` — filename without extension, e.g. \"claude-text\"
  `raw-fn`       — zero-arg function that calls the raw API and returns a reducible
                   of chunks (only called when cache is missing or `*live*` is true)

  Returns a vector of raw API chunks (decoded JSON maps).

  Usage in tests:
    (raw-fixture \"claude-text\"
      #(claude/claude-raw {:model \"claude-haiku-4-5\"
                           :input [{:role :user :content \"Say hello\"}]}))"
  [fixture-name raw-fn]
  (let [path (str fixture-dir "/" fixture-name ".json")
        file (io/file path)]
    (if (and (.exists file) (not *live*))
      (-> (slurp file) json/decode+kw)
      (do
        (log/infof "Capturing LLM fixture: %s" path)
        (let [chunks (into [] (raw-fn))]
          (.mkdirs (.getParentFile file))
          (spit path (json/encode chunks {:pretty true}))
          chunks)))))

;;; ──────────────────────────────────────────────────────────────────
;;; SSE helpers
;;; ──────────────────────────────────────────────────────────────────

(defn make-sse
  "Encode a sequence of values as an SSE data stream string.
  Includes `event:` lines like the real Anthropic/OpenAI APIs do."
  ^String [v]
  (->> v
       (map (fn [item]
              (let [event-type (or (some-> (:type item) name)
                                   "message")]
                (str "event: " event-type "\ndata: " (json/encode item) "\n\n"))))
       (str/join)))

;;; ──────────────────────────────────────────────────────────────────
;;; Mock chunk builders
;;; ──────────────────────────────────────────────────────────────────

(defn parts->aisdk-chunks
  "Expand high-level parts into low-level AI SDK v5 chunks.
  Accepts parts like `{:type :text :id \"t1\" :text \"Hello\"}` or
  `{:type :tool-input :id \"c1\" :function \"search\" :arguments {...}}`.
  Returns a flat sequence of start / delta / end chunks."
  [parts]
  (mapcat
   (fn [{:keys [id] :as part}]
     (case (:type part)
       :start [{:type :start :messageId id}]
       :usage [part]
       :error [part]
       :text  (concat
               [{:type :text-start :id id}]
               (for [bit (partition-all 5 (:text part))]
                 {:type :text-delta :id id :delta (str/join bit)})
               [{:type :text-end :id id}])
       :tool-input (concat
                    [{:type :tool-input-start :toolName (:function part) :toolCallId id}]
                    (for [bit (partition-all 5 (json/encode (:arguments part)))]
                      {:type :tool-input-delta :toolCallId id :inputTextDelta (str/join bit)})
                    [{:type :tool-input-available :toolName (:function part) :toolCallId id}])))
   parts))

(defn tool-boundary-error
  "Run one tool call through the agent tool boundary — the path production uses — and
  return the error text the model would see, or nil when the call was accepted.

  The text is the outcome's `:output`, which is where a failure's message lives now; a failure also
  carries `:error` with its class and code."
  [tool-name tool-var arguments]
  (let [tools  (metabot.tools/->entries [tool-var] (atom {}) nil nil)
        chunks (parts->aisdk-chunks
                [{:type :start :id "msg-boundary"}
                 {:type :tool-input :id "call-boundary" :function tool-name :arguments arguments}])
        result (-> (into [] (self.core/tool-executor-xf tools) chunks) last :result)]
    (when (:error result)
      (:output result))))

(defn call-tool
  "Call `tool` with `arguments` and return its `tools.core/result`.

  What a test uses in place of invoking a tool var as a function. A converted tool is a record, so
  `(the-tool args)` no longer works and the caller should not have to know whether this one does one
  item or several — `tools.core/call` decides that. `tool` may be the record, or a var holding one.

  `tool-names` is the profile the recovery steps are filtered against; it defaults to a profile that
  has `search`, since most steps offer it. Pass a smaller set to assert a step disappears.

  This is not the agent boundary: arguments are not validated and the scope is not checked. Use
  [[tool-boundary-error]] for those."
  ([tool arguments] (call-tool tool arguments #{"search"}))
  ([tool arguments tool-names]
   (tools.core/call (cond-> tool (var? tool) deref) arguments {:tool-names tool-names})))

(defn mock-llm-response
  "Create a mock LLM response (reducible) from high-level parts."
  [parts]
  (let [chunks (parts->aisdk-chunks parts)]
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (reduce rf init chunks)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Test tools
;;;
;;; Real (but trivial) tool implementations used by:
;;;   - adapter tests (fixture capture — LLM sees the schemas)
;;;   - self_test (tool-executor-xf — tools are actually called)
;;; ──────────────────────────────────────────────────────────────────

(defn get-time-tool []
  {:tool-name "get-time"
   :doc       "Return current time for a given IANA timezone."
   :schema    [:=> [:cat [:map {:closed true}
                          [:tz [:string {:description "IANA timezone, e.g. Europe/Bucharest"}]]]] :any]
   :fn        (fn [{:keys [tz]}]
                (str (java.time.ZonedDateTime/now (java.time.ZoneId/of tz))))})

(defn convert-currency-tool []
  {:tool-name "convert-currency"
   :doc       "Convert an amount between two ISO currencies using a dummy rate."
   :schema    [:=> [:cat [:map {:closed true}
                          [:amount :float]
                          [:from :string]
                          [:to :string]]] :any]
   :fn        (fn [{:keys [amount from to]}]
                (let [rate (if (= [from to] ["EUR" "USD"]) 1.16 1.0)]
                  {:amount    amount
                   :from      from
                   :to        to
                   :rate      rate
                   :converted (* amount rate)}))})

(defn mock-llm-tool []
  {:tool-name "mock-llm"
   :doc       "Return aisdk-formatted results as a reducible (IReduceInit).
  Useful for testing tool-executor-xf with tools that call back to an LLM."
   :schema    [:=> [:cat [:map {:closed true}
                          [:id :string]
                          [:input :string]]] :any]
   :fn        (fn [{:keys [id input]}]
                (let [chunks (parts->aisdk-chunks
                              [{:type :start :id "mock-1"}
                               {:type :text :id id :text input}])]
                  (reify clojure.lang.IReduceInit
                    (reduce [_ rf init]
                      (reduce rf init chunks)))))})

(defn no-arg-tool []
  {:tool-name "no-arg"
   :doc       "A tool that takes no arguments."
   :schema    [:=> [:cat [:map {:closed true}]] :any]
   :fn        (fn [_] {:output "ok"})})

(def TOOLS
  "Tool map for tests — keyed by tool name string."
  (let [tool-defs (map #(%) [get-time-tool convert-currency-tool mock-llm-tool no-arg-tool])]
    (into {} (map (juxt :tool-name identity)) tool-defs)))

;;; ──────────────────────────────────────────────────────────────────
;;; Queries
;;; ──────────────────────────────────────────────────────────────────

(defn unpermissionable-native-query
  "Build a query on `database-id` with native SQL under a later stage, whose permissions can't be calculated.
  Its snippet tag is missing `:snippet-name`, so the permission check can't normalize it."
  [database-id]
  {:lib/type :mbql/query
   :database database-id
   :stages   [{:lib/type      :mbql.stage/native
               :native        "SELECT * FROM {{snip}}"
               :template-tags {"snip" {:type         :snippet
                                       :name         "snip"
                                       :display-name "snip"
                                       :snippet-id   Integer/MAX_VALUE}}}
              {:lib/type :mbql.stage/mbql}]})
