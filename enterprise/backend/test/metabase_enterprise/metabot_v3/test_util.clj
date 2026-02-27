(ns metabase-enterprise.metabot-v3.test-util
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

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
  "Encode a sequence of values as an SSE data stream string."
  ^String [v]
  (->> (map json/encode v)
       (map #(str "data: " % "\n\n"))
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

(mu/defn get-time
  "Return current time for a given IANA timezone."
  [{:keys [tz]} :- [:map {:closed true}
                    [:tz [:string {:description "IANA timezone, e.g. Europe/Bucharest"}]]]]
  (str (java.time.ZonedDateTime/now (java.time.ZoneId/of tz))))

(mu/defn convert-currency
  "Convert an amount between two ISO currencies using a dummy rate."
  [{:keys [amount from to]} :- [:map {:closed true}
                                [:amount :float]
                                [:from :string]
                                [:to :string]]]
  (let [rate (if (= [from to] ["EUR" "USD"]) 1.16 1.0)]
    {:amount    amount
     :from      from
     :to        to
     :rate      rate
     :converted (* amount rate)}))

(mu/defn mock-llm
  "Return aisdk-formatted results as a reducible (IReduceInit).
  Useful for testing tool-executor-xf with tools that call back to an LLM."
  [{:keys [id input]} :- [:map {:closed true}
                          [:id :string]
                          [:input :string]]]
  (let [chunks (parts->aisdk-chunks
                [{:type :start :id "mock-1"}
                 {:type :text :id id :text input}])]
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (reduce rf init chunks)))))

(def TOOLS
  "Tool map for tests — keyed by tool name string."
  (u/index-by
   #(-> % meta :name name)
   [#'get-time
    #'convert-currency
    #'mock-llm]))
