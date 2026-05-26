(ns metabase.llm.startup
  "Startup-time reconciliation for managed Metabot configuration."
  (:require
   [clojure.string :as str]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- sync-managed-metabot-provider!
  []
  (let [raw-provider (setting/db-stored-value :llm-metabot-provider)
        configured?  (metabot.settings/llm-metabot-configured?)]
    (if (and (str/blank? raw-provider)
             (not configured?))
      (do
        (log/infof "Configuring llm-metabot-provider to %s for legacy Metabot entitlement"
                   metabot.settings/default-metabase-llm-metabot-provider)
        (setting/set! :llm-metabot-provider metabot.settings/default-metabase-llm-metabot-provider))
      nil)))

(defn- maybe-sync-managed-metabot-provider!
  []
  (let [legacy-result  (premium-features/canonically-has-feature? :metabot-v3)
        managed-result (premium-features/canonically-has-feature? :metabase-ai-managed)]
    (cond
      (or (nil? legacy-result) (nil? managed-result))   nil
      (and legacy-result (not managed-result))          (sync-managed-metabot-provider!))))

(defn check-and-sync-settings-on-startup!
  "For legacy `:metabot-v3` customers that do not have `:metabase-ai-managed`,
  switch the default unmanaged Metabot provider to the managed `metabase/...`
  provider on startup."
  []
  (maybe-sync-managed-metabot-provider!))
