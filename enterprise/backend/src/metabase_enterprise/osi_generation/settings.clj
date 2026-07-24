(ns metabase-enterprise.osi-generation.settings
  "Provider and model configuration for OSI metadata generation.

  Generation is a background batch job, so it can choose a cheaper provider/model than Metabot chat.
  It deliberately shares the selected provider's configured LLM credentials and attributes spend with
  [[usage-source]]."
  (:require
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.provider-util :as provider-util]
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

(defsetting osi-generation-enabled
  (deferred-tru "Whether to automatically generate library metadata with AI.")
  :type       :boolean
  :default    false
  :getter     #(and (llm.settings/ai-features-enabled?)
                    (setting/get-value-of-type :boolean :osi-generation-enabled))
  :visibility :admin
  :encryption :no
  :export?    false
  :doc        false)

(defsetting osi-generation-provider
  (deferred-tru "The AI provider and model used to generate library metadata. Format: provider/model-name. Unset means use Metabot''s provider.")
  :type       :string
  :encryption :no
  :default    nil
  :visibility :settings-manager
  :export?    false
  :doc        false
  :setter     (fn [new-value]
                (when new-value
                  (metabot.settings/validate-metabot-provider! new-value))
                (setting/set-value-of-type! :string :osi-generation-provider new-value)))

;;; ----------------------------------------------- Resolution --------------------------------------------------

(defn provider-and-model
  "The `provider/model` string OSI generation should call.

  [[osi-generation-provider]] when set, otherwise Metabot's. Never nil in practice —
  `llm-metabot-provider` carries a default — so callers may pass the result straight to
  `parse-provider-model`."
  []
  ;; Blank is equivalent to unset: setting setters trim secret values the same way, and a blank
  ;; provider cannot identify a deliberate routing target.
  (or (u/trimmed-string (osi-generation-provider))
      (metabot.settings/llm-metabot-provider)))

(defn credentials
  "The shared LLM credentials for the direct `provider`. This named seam keeps callers from reaching
  into Metabot settings."
  [provider]
  (metabot.settings/configured-provider-credentials provider))

(defn credentials-source
  "How the selected provider authenticates: `:metabot` for shared direct-provider credentials,
  `:proxy` for the managed service, or nil when the selected route is unavailable."
  [provider-and-model-str]
  (if (provider-util/metabase-provider? provider-and-model-str)
    ;; Not :proxy when the proxy URL is unset — that is nil, not a working path.
    (when (u/trimmed-string (llm.settings/llm-proxy-base-url))
      :proxy)
    (let [provider (provider-util/provider-and-model->provider provider-and-model-str)]
      (when (some? (credentials provider))
        :metabot))))

(defn configured?
  "Whether OSI generation can reach an LLM right now.

  Proxy base URL set for a `metabase/*` provider, otherwise complete [[credentials]] for the resolved
  direct provider. The generation job gates on this and no-ops when false; the manual API 400s."
  []
  (let [pam (provider-and-model)]
    (if (provider-util/metabase-provider? pam)
      (boolean (u/trimmed-string (llm.settings/llm-proxy-base-url)))
      (let [provider (provider-util/provider-and-model->provider pam)]
        (boolean (some->> (credentials provider)
                          (metabot.settings/provider-credentials-complete? provider)))))))

(defn llm-call-opts
  "Everything the generator needs to make its call:
  `{:provider-and-model s :source usage-source}`.

  The only member of this namespace the generator reads — the raw settings are not a caller contract,
  because `osi-generation-provider` defaults to nil and the Metabot fallback lives here. Provider
  adapters continue to read the shared LLM credentials exactly as they do for Metabot."
  []
  (let [pam (provider-and-model)]
    {:provider-and-model pam
     :source             usage-source}))

(defsetting osi-generation-llm-configured?
  "Whether credentials for the selected OSI generation provider are configured."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #(configured?)
  :doc        false)

;;; ------------------------------------------------- Run caps --------------------------------------------------

;; The per-run caps are *soft* thresholds: the loop checks them between candidates, so one call may
;; overshoot and a wedged call is never interrupted. Conservative defaults keep an
;; accidentally enabled job bounded on its first production run; operators tune them off the emitted
;; run metrics. The hard per-call ceiling lives elsewhere — the LLM call's max output tokens and the
;; embedding request timeout — not in these advisory numbers.

(defsetting osi-generation-max-entities-per-run
  (deferred-tru "Soft cap on how many library entities one automatic metadata-generation run will process. Unset means no limit.")
  :type       :positive-integer
  :default    100
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)

(defsetting osi-generation-max-tokens-per-run
  (deferred-tru "Soft cap on the LLM tokens (input plus output) one automatic metadata-generation run will spend. Checked between calls, so the run in flight may overshoot. Unset means no limit.")
  :type       :positive-integer
  :default    500000
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)

(defsetting osi-generation-max-run-duration-minutes
  (deferred-tru "Soft cap on how long an automatic metadata-generation run may run before it stops taking new candidates. The deadline spans selection, generation, write-back and the final reconcile. Unset means no limit.")
  :type       :positive-integer
  :default    30
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)

;; Persistent quota machinery: a per-run cap bounds one run, not spend over time — a
;; superuser re-triggering multiplies it. These hourly/daily token quotas are summed from
;; `ai_usage_log` across every run and node. They intentionally ship unset while the feature is disabled:
;; the query mechanism is live, but a useful deployment-wide number requires a measured backlog run.

(defsetting osi-generation-max-tokens-per-hour
  (deferred-tru "Persistent quota on OSI generation LLM tokens spent in the trailing hour, across all runs. Unset means no limit.")
  :type       :positive-integer
  :default    nil
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)

(defsetting osi-generation-max-tokens-per-day
  (deferred-tru "Persistent quota on OSI generation LLM tokens spent in the trailing day, across all runs. Unset means no limit.")
  :type       :positive-integer
  :default    nil
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)

(defsetting osi-generation-candidate-offset
  (deferred-tru "Persistent fairness offset for rotating OSI generation candidates and the tier that starts each run.")
  :type       :integer
  :default    0
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)
