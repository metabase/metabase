(ns metabase-enterprise.osi-generation.prompt
  "Prompt construction and response schema for OSI metadata generation.

  [[build-messages]] is a pure function of the candidate — no clock reads, no settings reads, no appdb —
  so the same row state always renders the same prompt for reproducibility and prompt caching. The
  system message is static and cache-friendly; the user message carries the row state: the entity's
  `:llm-input` projection, existing metadata with its ownership and absolute timestamps (never a
  current date or elapsed time), and the basis diff so the model knows WHAT changed. Human-approved
  rows reach this layer only after an explicit rewrite request. An empty diff never reaches this
  namespace — the loop restamps and skips upstream."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.osi.ai-context.api :as osi-api]
   [metabase.util.malli :as mu]
   [selmer.parser :as selmer])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Templates --------------------------------------------------

(def ^:private system-template-path "metabase_enterprise/osi_generation/prompts/context_system.selmer")
(def ^:private user-template-path "metabase_enterprise/osi_generation/prompts/context_user.selmer")

(defn- load-template
  "Slurp a prompt template off the classpath (EE `src` is the EE classpath root)."
  [path]
  (or (some-> (io/resource path) slurp)
      (throw (ex-info "Prompt template not found" {:path path}))))

(def ^:private system-template (delay (load-template system-template-path)))
(def ^:private user-template (delay (load-template user-template-path)))

(defn- iso-utc
  "An `OffsetDateTime` column value as an absolute ISO-8601 UTC string for the prompt, nil-safe.
  Absolute and offset-normalized so the rendered prompt is a pure function of row state — the same
  instant read back under a different offset must render identically."
  [t]
  (when t
    (str (.toInstant ^OffsetDateTime t))))

;;; ---------------------------------------------- Render context -----------------------------------------------

(defn- existing-block
  "Template context for the existing-context block, or nil when the candidate has no stored row:
  the previous `ai_context`, its ownership, and both staleness timestamps as absolute ISO-8601 UTC."
  [{:keys [ai_context data_source generated_at invalidated_at] :as existing-context}]
  (when existing-context
    {:human-approved (contains? #{:human "human"} data_source)
     :generated-at   (iso-utc generated_at)
     :invalidated-at (iso-utc invalidated_at)
     :instructions   (:instructions ai_context)
     :synonyms       (not-empty (:synonyms ai_context))
     :examples       (not-empty (:examples ai_context))}))

(defn- diff-block
  "Template context for the diff block — one `{:field s :from s :to s}` per changed basis key, in
  `:changed`'s (sorted) order — or nil for a nil diff (tier-1 fresh generation / forced rewrite)."
  [{:keys [changed from to] :as diff}]
  (when diff
    (mapv (fn [k]
            ;; `pr-str` is deterministic for the basis' scalar/vector values and visibly distinguishes
            ;; an absent value from an empty string in the prompt.
            {:field (name k)
             :from  (pr-str (get from k))
             :to    (pr-str (get to k))})
          changed)))

(defn build-messages
  "The chat messages for one candidate:
  `[{:role \"system\" :content s} {:role \"user\" :content s}]`.
  Pure over the candidate: renders `:llm-input` and `:diff`, plus `:existing-context` when present —
  never `:entity`, which exists for the write path."
  [{:keys [llm-input diff existing-context rewrite-requested?] :as _candidate}]
  (let [system (selmer/render @system-template
                              {:max-instructions-len entity-retrieval/max-instructions-len
                               :max-list-len         entity-retrieval/max-list-len
                               :max-item-len         entity-retrieval/max-item-len})
        ;; These are the complete v1 prompt-projection keys. Adding another key requires a prompt
        ;; version bump and a corresponding template change.
        user   (selmer/render @user-template
                              (merge llm-input
                                     {:existing (existing-block existing-context)
                                      :diff     (diff-block diff)
                                      :fresh    (and (nil? diff) (nil? existing-context))
                                      :rewrite-requested rewrite-requested?}))]
    [{:role "system", :content system}
     {:role "user", :content user}]))

;;; --------------------------------------------- Response schema -----------------------------------------------

(def response-json-schema
  "JSON Schema for the forced structured-output tool call. Every field optional — an empty object is the
  model's \"nothing worth writing\" answer, which [[metabase-enterprise.osi-generation.generate]] returns
  as an empty `:ai_context` so the row still converges. Caps are the same values as the write API's
  `AiContext` malli schema (hoisted to `entity-retrieval.core`), so nothing the model can emit is
  rejected at write time."
  {:type                 "object"
   :properties           {:instructions {:type        "string"
                                         :maxLength   entity-retrieval/max-instructions-len
                                         :description "Guidance for the AI analyst using this entity. Omit when the entity needs none."}
                          :synonyms     {:type        "array"
                                         :maxItems    entity-retrieval/max-list-len
                                         :items       {:type "string" :maxLength entity-retrieval/max-item-len}
                                         :description "Alternate names people use for this entity."}
                          :examples     {:type        "array"
                                         :maxItems    entity-retrieval/max-list-len
                                         :items       {:type "string" :maxLength entity-retrieval/max-item-len}
                                         :description "Natural-language questions this entity answers."}}
   :additionalProperties false})

(defn validate-response!
  "Validate a parsed structured-output response against the `AiContext` shape and caps; returns it.
  Throws on a non-map, wrong field types, or over-cap values (providers do not reliably enforce
  maxLength/maxItems), so a schema-violating response never reaches the write path — the loop's
  per-candidate isolation catches the throw."
  [response]
  (when-not (map? response)
    (throw (ex-info "Invalid LLM response shape for OSI context generation"
                    {:response response, :expected "{:instructions s, :synonyms [s], :examples [s]}"})))
  (mu/validate-throw osi-api/AiContext response))

;;; ---------------------------------------------- Prompt identity ----------------------------------------------

(def ^:private version*
  (delay (-> (str @system-template "\n" @user-template "\n" (pr-str response-json-schema))
             buddy-hash/sha256
             codecs/bytes->hex
             (subs 0 12))))

(defn version
  "Content identity of the prompt layer: a hash of both templates plus the response schema.
  Any revision to what the model is shown or must return changes the generation seam's
  `generator-version` without a hand bump, so rows stamped under an older prompt stay distinguishable."
  []
  @version*)
