(ns metabase-enterprise.transform-optimizer.llm
  "Calls the LLM with our prelude + per-transform context and a
  structured-output JSON schema, returning the parsed proposal payload.

  We use `metabot.self/call-llm-structured` rather than calling the Claude
  client directly — it gives us retry-with-exponential-backoff, token-usage
  telemetry, and provider abstraction (we can swap to OpenAI / OpenRouter
  via the provider-and-model string).

  Trade-off: `call-llm-structured` doesn't support a separate `system` field,
  so we concatenate prelude + context into one user message. Cache utility
  is slightly worse than a dedicated system prompt would give us, but this
  keeps the dependency surface narrow.

  Today the call is buffered (we consume the whole stream before returning).
  The HTTP streaming endpoint then re-emits the parts as SSE events. The
  client-facing contract stays the same when we upgrade to incremental
  streaming later."
  (:require
   [metabase.metabot.self :as metabot.self]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; JSON Schema for the structured output
;;
;; Fed to the provider as the `schema` arg to `call-llm-structured`. The
;; shape must match what `core/finalise-proposals` expects.

(def ^:private ddl-target-schema
  ;; "source-db" | "transform-target" | { "precompute-of": "<sibling id>" }
  {:oneOf [{:type "string" :enum ["source-db" "transform-target"]}
           {:type "object"
            :properties           {:precompute-of {:type "string"}}
            :required             ["precompute-of"]
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
  "JSON Schema for the LLM's structured response — `{summary, proposals[]}`."
  {:type "object"
   :additionalProperties false
   :properties {:summary   {:type "string"}
                :proposals {:type "array" :items proposal-schema}}
   :required ["summary" "proposals"]})

;; ---------------------------------------------------------------------------
;; Defaults

(def ^:private default-provider-and-model
  "Optimizer reasoning over SQL benefits from a stronger model; Sonnet is a
  good balance of latency / quality / cost for the hackathon. Override per
  call via the `:provider-and-model` option."
  "anthropic/claude-sonnet-4-6")

(def ^:private default-temperature 0.2)
(def ^:private default-max-tokens  4096)

;; ---------------------------------------------------------------------------
;; Public API

(defn- compose-user-message
  "Combine the prelude and the per-transform context into a single string.
  The `call-llm-structured` API doesn't expose a separate system slot, so
  we use a clear delimiter and let the model treat the prelude as
  authoritative instructions."
  [{:keys [system user]}]
  (str (or system "")
       "\n\n---\n\n"
       "# Transform to optimise\n\n"
       (or user "")))

(defn propose-optimizations
  "Call the LLM with the optimizer prelude + rendered context and return the
  parsed `{summary, proposals[]}` map.

  `prompt-map` is the output of `core/build-prompt`:
    {:system  <prelude markdown>
     :user    <rendered context>
     :context <raw context, unused here>}

  Options:
    :provider-and-model — defaults to `anthropic/claude-sonnet-4-6`
    :temperature         — defaults to 0.2
    :max-tokens          — defaults to 4096
    :tracking            — extra map merged into the telemetry tracking-opts
                           (see metabase.metabot.self/call-llm)"
  [prompt-map & {:keys [provider-and-model temperature max-tokens tracking]
                 :or   {provider-and-model default-provider-and-model
                        temperature        default-temperature
                        max-tokens         default-max-tokens}}]
  (let [messages [{:role "user" :content (compose-user-message prompt-map)}]
        track    (merge {:source "transform-optimizer"
                         :tag    "optimize-proposals"} tracking)]
    (try
      (let [result (metabot.self/call-llm-structured
                    provider-and-model
                    messages
                    output-schema
                    temperature
                    max-tokens
                    track)]
        (log/debugf "transform-optimizer: LLM returned %d proposals"
                    (count (:proposals result)))
        result)
      (catch Exception e
        (log/errorf e "transform-optimizer: LLM call failed")
        (throw (ex-info "LLM call failed"
                        {:status-code 502
                         :cause       (ex-message e)
                         :retryable   (boolean (-> e ex-data :status (#{408 409 429 502 503 504})))}
                        e))))))
