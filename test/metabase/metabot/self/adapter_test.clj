(ns metabase.metabot.self.adapter-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.metabot.self.azure :as azure]
   [metabase.metabot.self.bedrock :as bedrock]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.deepseek :as deepseek]
   [metabase.metabot.self.mistral :as mistral]
   [metabase.metabot.self.moonshot :as moonshot]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.metabot.self.zai :as zai]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.util.log.capture :as log.capture]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Request counts
;;; ──────────────────────────────────────────────────────────────────

(defn- tool [n]
  {:tool-name (str "tool-" n)
   :doc       "A tool."
   :schema    [:=> [:cat [:map {:closed true} [:x :string]]] :any]
   :fn        (fn [_] "ok")})

(defn- captured-counts
  "Run a Claude request with HTTP and streaming stubbed out, and return the `:msg-count` / `:tool-count`
  [[adapter/stream!]] reported for it.

  Read back off the debug log rather than the span: `metabase.util.o11y/with-span` passes its map straight
  to clj-otel, which reads only `:name`/`:attributes`/`:parent`/… and silently drops everything else, so
  these counts never reach a span. That is true on master too and is not this namespace's to fix."
  [opts]
  (let [msgs (log.capture/with-log-messages-for-level [msgs [metabase.metabot.self.adapter :debug]]
               (with-redefs [self.core/sse-reducible             identity
                             self.core/reducible-with-api-errors (fn [r _ _] r)
                             debug/capture-stream                (fn [r _] r)
                             http/request                        (fn [req] {:body req})]
                 (claude/claude-raw (merge {:model       "claude-haiku-4-5"
                                            :credentials {:api-key  "sk-ant-test"
                                                          :base-url "https://api.anthropic.com"}}
                                           opts)))
               (msgs))]
    (some-> (m/find-first #(str/includes? (:message %) "Anthropic request") msgs)
            :message
            (->> (re-find #"\{:model .*?:msg-count (\d+), :tools (\d+)\}"))
            (->> (drop 1) (mapv parse-long))
            (->> (zipmap [:msg-count :tool-count])))))

(deftest counts-describe-the-callers-request-test
  (testing "tool-count is the tools the caller offered, not the tools that reach the wire"
    ;; a structured-output request replaces the whole tool array with one synthetic `structured_output`
    ;; tool, so counting the composed body reported 1 however many tools the caller passed
    (is (= {:msg-count 1 :tool-count 15}
           (captured-counts {:input  [{:role :user :content "hi"}]
                             :tools  (mapv tool (range 15))
                             :schema {:type "object" :properties {}}}))))
  (testing "msg-count is the caller's AISDK parts, not the messages the dialect merged them into"
    ;; `parts->claude-messages` collapses consecutive assistant parts into one wire message
    (is (= {:msg-count 3 :tool-count 0}
           (captured-counts {:input [{:role :user :content "hi"}
                                     {:type :text :text "one"}
                                     {:type :text :text "two"}]})))))
