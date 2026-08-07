(ns metabase.llm.startup
  "Startup-time reconciliation for managed Metabot configuration."
  (:require
   [clojure.string :as str]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.setup.core :as setup]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- managed-connection
  []
  {:key    llm.provider/managed-connection-key
   :type   llm.provider/managed-connection-key
   :name   (str (:label (llm.provider/provider-type llm.provider/managed-connection-key)))
   :config {}})

(defn- ensure-managed-connection!
  "Materialize the connection for the Metabase-managed provider. It holds no credentials of its own, so it exists
  purely so that a `metabase/...` model reference resolves. Returns whether the connection exists afterwards.

  Nothing is written when `llm-providers` is set by an env var: the write would land in the app DB and then lose to
  the env var on every read, leaving the model reference naming a connection that never resolves."
  []
  (cond
    (llm.provider/connection llm.provider/managed-connection-key)
    true

    (some? (setting/env-var-value :llm-providers))
    false

    :else
    (do (llm.provider/set-connections! (conj (llm.provider/stored-connections) (managed-connection)))
        true)))

(defn- sync-managed-metabot-provider!
  []
  (let [raw-provider (setting/db-stored-value :llm-metabot-provider)
        configured?  (metabot.settings/llm-metabot-configured?)]
    (when (and (str/blank? raw-provider)
               (not configured?))
      (if (ensure-managed-connection!)
        (do
          (log/infof "Configuring llm-metabot-provider to %s for legacy Metabot entitlement"
                     metabot.settings/default-metabase-llm-metabot-provider)
          (setting/set! :llm-metabot-provider metabot.settings/default-metabase-llm-metabot-provider))
        (log/warnf "Leaving llm-metabot-provider unset for legacy Metabot entitlement: %s is set by the environment and lists no %s connection"
                   (setting/env-var-name :llm-providers)
                   llm.provider/managed-connection-key)))))

(defn- maybe-sync-managed-metabot-provider!
  []
  (let [legacy-result  (premium-features/canonically-has-feature? :metabot-v3)
        managed-result (premium-features/canonically-has-feature? :metabase-ai-managed)]
    (cond
      (or (nil? legacy-result) (nil? managed-result))   nil
      (and legacy-result (not managed-result))          (sync-managed-metabot-provider!))))

(defn check-and-sync-settings-on-startup!
  "Reconcile LLM provider configuration at startup: for legacy `:metabot-v3` customers that do not have
  `:metabase-ai-managed`, switch the default unmanaged Metabot provider to the managed `metabase/...` provider.

  This is for existing instances only: it is skipped until initial setup has completed, so fresh instances choose
  their AI provider in the setup wizard instead of booting pre-configured."
  []
  (when (setup/has-user-setup)
    (maybe-sync-managed-metabot-provider!)))
