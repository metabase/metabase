(ns metabase-enterprise.osi-generation.generate
  "The generator seam between the OSI generation loop and the LLM.

  Renders the candidate into the [[metabase-enterprise.osi-generation.prompt]] messages, makes the
  structured call through [[metabase.metabot.self/call-llm-structured+usage]] with the provider/model
  `settings/llm-call-opts` resolves, validates the response, and returns it for the loop
  to write back — the signature and return shape are the seam contract and do not change."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [metabase-enterprise.osi-generation.prompt :as prompt]
   [metabase-enterprise.osi-generation.settings :as settings]
   [metabase.metabot.self :as self]))

(set! *warn-on-reflection* true)

(defn generator-version
  "The enrichment identity — prompt plus model — stamped into `osi_ai_context.generator_version` on every
  write-back. The prompt component is [[prompt/version]], a content hash of the templates + response
  schema, so any prompt revision changes the stamp with no hand bump to forget — the basis diff cannot
  see a prompt upgrade. Nothing reads it in v1; it exists so a later prompt/model upgrade can select
  rows generated under an older identity without a schema change."
  ([]
   (generator-version (:model-ref (settings/llm-call-opts))))
  ([model-ref]
   (let [identity (str "prompt-" (prompt/version) ":" model-ref)]
     (str "v1-" (subs (codecs/bytes->hex (buddy-hash/sha256 identity)) 0 32)))))

(def ^:private temperature 0.3)

(def ^:private max-tokens
  "Output-token ceiling. Instructions alone can be 5000 chars, and reasoning models spend output tokens
  before the forced tool call (see example-question-generator's rationale), so the ceiling is generous;
  non-reasoning providers stop well under it."
  8192)

(defn- normalized-response
  [response]
  (into {} (remove (fn [[_ value]]
                     (or (nil? value)
                         (and (string? value) (str/blank? value))
                         (and (sequential? value) (empty? value)))))
        response))

(defn generate-context
  "Generate ai_context for one candidate.

  `candidate` is the map built by `candidates`: `:entity` (hydrated source entity, for the write path's
  keys), `:llm-input` (the `:osi-context` projection output the prompt renders), `:basis` (fresh),
  `:diff` (`basis-diff` stored->fresh; nil for tier-1 fresh generation), and `:existing-context` (the
  stored Metabot row incl. `generated_at`/`invalidated_at`, nil when none) so the prompt can use its
  prior draft as context. Human-approved rows are excluded before this function.

  Returns `{:ai_context        {:instructions ... :synonyms [...] :examples [...]}
            :generator-version <the prompt+model identity stamped into the row>
            :usage             {:input-tokens n :output-tokens n}}`
  Empty/blank output is returned as an empty `:ai_context` so the write path still stamps the basis
  and the paid call is not repeated on every run. `:usage` rides every return that reached a provider,
  and a throw after a billed call carries it in `ex-data`. Throws on LLM failure or an invalid
  response; per-candidate isolation is the loop's job. Never touches the appdb."
  [candidate]
  (let [{:keys [model-ref source]} (settings/llm-call-opts)
        messages (prompt/build-messages candidate)
        {:keys [result usage]} (self/call-llm-structured+usage
                                model-ref
                                messages
                                prompt/response-json-schema
                                temperature
                                max-tokens
                                {:request-id (str (random-uuid))
                                 :source     source
                                 :tag        "osi-generation"})]
    (try
      (prompt/validate-response! result)
      {:ai_context        (normalized-response result)
       :generator-version (generator-version model-ref)
       :usage             usage}
      (catch Exception e
        ;; The provider has already returned and its per-call usage has already been logged. Preserve
        ;; that usage for the run budget even when local schema validation rejects the answer.
        (throw (ex-info "Invalid OSI generation response" {:usage usage} e))))))
