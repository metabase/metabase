(ns metabase-enterprise.transform-optimizer.llm
  "Calls the Anthropic / Claude client with our prelude + per-transform
  context and a structured-output JSON schema, returning the proposal payload
  as parsed Clojure data.

  We don't go through Metabot's agent loop here — there is no tool dispatch
  and no multi-turn reasoning, just one prompt → one structured response.
  The `:schema` option on `claude-raw` forces Claude to call a synthetic
  `structured_output` tool whose arguments match our schema; we pull the
  parsed arguments out of the AISDK stream.

  Today the call is buffered (we consume the whole stream before returning).
  The HTTP streaming endpoint then re-emits the parts on the wire with
  small artificial gaps. We can upgrade to incremental JSON parsing later
  without changing the endpoint contract."
  (:require
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as self.core]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; JSON Schema for the structured output
;;
;; This is fed to Anthropic as `input_schema` of a forced tool call.
;; The shape must match what `core/finalise-proposals` expects.

(def ^:private ddl-target-schema
  ;; "source-db" | "transform-target" | { "precompute-of": "<sibling id>" }
  {:oneOf [{:type "string" :enum ["source-db" "transform-target"]}
           {:type "object"
            :properties   {:precompute-of {:type "string"}}
            :required     ["precompute-of"]
            :additionalProperties false}]})

(def ^:private ddl-statement-schema
  {:type "object"
   :additionalProperties false
   :properties {:id        {:type "string"}
                :target    ddl-target-schema
                :statement {:type "string"
                            :description "Single CREATE INDEX [CONCURRENTLY] [IF NOT EXISTS] …"}
                :rationale {:type "string"}}
   :required ["id" "target" "statement" "rationale"]})

(def ^:private proposal-schema
  {:type "object"
   :additionalProperties false
   :properties {:id               {:type "string"}
                :name             {:type "string"}
                :kind             {:type "string"
                                   :enum ["rewrite" "index" "rewrite+index" "precompute"]}
                :severity         {:type "string"
                                   :enum ["high" "medium" "low"]}
                :rationale        {:type "string"}
                :expected_speedup {:type "string"}
                :body             {:type ["string" "null"]
                                   :description "SQL of the new transform, or null for kind=index"}
                :depends_on       {:type "array" :items {:type "string"}}
                :ddl_statements   {:type "array" :items ddl-statement-schema}}
   :required ["id" "name" "kind" "severity" "rationale" "expected_speedup"
              "depends_on" "ddl_statements"]})

(def output-schema
  "JSON Schema for the LLM's structured response — `{summary, proposals[]}`.
  Public so the agent endpoint can include the same shape in its OpenAPI docs."
  {:type "object"
   :additionalProperties false
   :properties {:summary   {:type "string"}
                :proposals {:type "array" :items proposal-schema}}
   :required ["summary" "proposals"]})

;; ---------------------------------------------------------------------------
;; Model selection
;;
;; Optimizer reasoning over SQL benefits from a stronger model. We default to
;; Sonnet (good balance of latency / quality / cost); callers can override
;; per-request when we want to test with Opus.

(def ^:private default-model "claude-sonnet-4-6")

;; ---------------------------------------------------------------------------
;; Stream consumption

(defn- collect-parts
  "Reduce the AISDK stream into a vector of parts. The buffered approach lets
  us inspect the full response (text, tool-input, errors) before returning."
  [stream]
  (into [] (self.core/aisdk-xf) stream))

(defn- pick-structured-output
  "From the AISDK parts, pull the one tool-input emitted by Claude's forced
  `structured_output` tool call. Throws with diagnostic context if the LLM
  failed to emit one (rate-limit, schema violation, finished early)."
  [parts]
  (or (some (fn [{:keys [type function arguments]}]
              (when (and (= type :tool-input)
                         (or (= function "structured_output")
                             (= function :structured_output)))
                arguments))
            parts)
      (throw (ex-info "LLM did not emit structured_output"
                      {:status-code 502
                       :parts       (mapv #(select-keys % [:type :function :text]) parts)}))))

(defn- check-no-error
  "If the stream surfaced an `:error` part, rethrow with its details."
  [parts]
  (when-let [err (some #(when (= :error (:type %)) %) parts)]
    (throw (ex-info (or (:errorText err) "LLM stream errored")
                    {:status-code 502 :error err}))))

;; ---------------------------------------------------------------------------
;; Public API

(defn propose-optimizations
  "Call Claude with the optimizer prelude + rendered context and return the
  parsed `{summary, proposals[]}` map.

  `prompt-map` is the output of `core/build-prompt`:
    {:system  <prelude markdown>
     :user    <rendered context>
     :context <raw context, unused here>}

  Options:
    :model       — model id (defaults to claude-sonnet-4-6)
    :max-tokens  — defaults to 4096; raise for deeply-nested DAG proposals
    :temperature — defaults to 0.2 (we want consistency, not creativity)"
  [{:keys [system user]} & {:keys [model max-tokens temperature]
                            :or   {model       default-model
                                   max-tokens  4096
                                   temperature 0.2}}]
  (let [opts   {:model       model
                :system      system
                :input       [{:role "user" :content user}]
                :schema      output-schema
                :temperature temperature
                :max-tokens  max-tokens}
        stream (claude/claude opts)
        parts  (collect-parts stream)]
    (check-no-error parts)
    (let [result (pick-structured-output parts)]
      (log/debugf "transform-optimizer: LLM returned %d proposals"
                  (count (:proposals result)))
      result)))
