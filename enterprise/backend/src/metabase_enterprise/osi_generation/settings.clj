(ns metabase-enterprise.osi-generation.settings
  "Model configuration for OSI metadata generation.

  Generation is a background batch job, so it can run on a different model — and a different provider
  connection — than Metabot chat. Pointing it at a second connection of the same provider type is how an
  instance gives generation its own API key and its own spend; see [[metabase.llm.provider]] for the
  connection model. Spend is attributed with [[usage-source]] either way."
  (:require
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(def usage-source
  "The `ai_usage_log.source` / tracking-opts `:source` value for every LLM call OSI generation makes.

  This keeps background-generation spend separate from interactive Metabot usage."
  "osi-generation")

;;; ------------------------------------------------- Settings --------------------------------------------------

(defn- -osi-generation-model
  "Generation runs on whatever Metabot runs on until an admin points it somewhere else, so an instance that
  never configures generation still generates.

  Trimmed on read because `MB_OSI_GENERATION_MODEL` bypasses the setter that would normally do it: without
  this a padded value names no connection, and a whitespace-only one reads as a deliberate choice and
  suppresses the fallback."
  []
  (or (u/trimmed-string (setting/get-value-of-type :string :osi-generation-model))
      (metabot.settings/llm-metabot-provider)))

(defsetting osi-generation-model
  (deferred-tru "The AI provider connection and model used to generate library metadata, in the same connection-key/model-name format as `llm-metabot-provider`. Defaults to the model Metabot runs on. Naming a second connection of the same provider type gives generation its own credentials.")
  :type       :string
  :encryption :no
  :visibility :settings-manager
  :export?    false
  :doc        false
  :getter     #'-osi-generation-model
  :setter     (fn [new-value]
                (setting/set-value-of-type!
                 :string :osi-generation-model
                 (metabot.settings/normalize-model-ref new-value))))

;;; ----------------------------------------------- Resolution --------------------------------------------------

(defn- usable-model-ref?
  "Whether `model-ref` names something the generation call can actually use.

  Beyond a usable connection, the reference itself has to be one the call path accepts: a known provider
  type, and a model segment that satisfies whatever extra rule that type imposes — Azure's
  `{family}/{deployment}`, the managed proxy's fixed catalog. The stored setter enforces all of this, but
  `MB_OSI_GENERATION_MODEL` bypasses it and `llm-providers` can be written by env or serdes, so a
  reference that only *looks* resolvable would otherwise report ready and fail at the first call.

  A reference is also stale if the connection composes its own model and now serves a different one: the
  edit path repoints stored references, but an env-pinned one cannot be rewritten, so it would otherwise
  report ready and call an obsolete deployment.

  `validate-model-ref!` throws by design; this is a read path — [[configured?]] backs a `:visibility
  :public` setting — so the refusal is converted to false rather than propagated."
  [model-ref]
  (let [conn-key   (llm.provider/model-ref->connection-key model-ref)
        {:keys [type config]} (llm.provider/connection conn-key)
        ;; Only for types that compose their model from config — Azure's {family}/{deployment}. A type
        ;; whose catalog is listed or fixed serves many models, so its configured one is a default, not a
        ;; constraint, and a reference naming another of them is legitimate.
        composed   (llm.provider/connection-model type (llm.provider/with-field-defaults type config))]
    (boolean
     (and (some? (u/trimmed-string (llm.provider/model-ref->model model-ref)))
          (llm.provider/connection-usable? conn-key)
          (some? (llm.provider/provider-type type))
          (or (nil? composed)
              (= composed (llm.provider/model-ref->model model-ref)))
          (try
            (metabot.settings/validate-model-ref! model-ref)
            true
            (catch Exception _ false))))))

(defn credentials-source
  "How the selected connection authenticates: `:proxy` for the Metabase-managed service, `:connection` for a
  connection's own credentials, or nil when the reference names nothing usable."
  [model-ref]
  (when (usable-model-ref? model-ref)
    (if (:ai-proxy? (llm.provider/resolve-model-ref model-ref))
      :proxy
      :connection)))

(defn configured?
  "Whether OSI generation can reach an LLM right now — [[usable-model-ref?]] defines what that requires.
  The generation job gates on this and no-ops when false; the manual API 400s."
  []
  (usable-model-ref? (osi-generation-model)))

(defn llm-call-opts
  "Everything the generator passes to a single LLM call: `{:model-ref s :source usage-source}`.

  Credentials stay out of it — adapters resolve those from the connection the reference names, exactly as
  they do for Metabot."
  []
  {:model-ref (osi-generation-model)
   :source    usage-source})

(defsetting osi-generation-llm-configured?
  "Whether the reference selected for OSI generation names a model this instance can call."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #(configured?)
  :doc        false)
