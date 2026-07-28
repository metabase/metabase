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

(defn- migrate-legacy-provider-connections!
  "Move an instance off the per-provider credential settings and onto `llm-providers`.

  Runs only when `llm-providers` has never been written, so it is a one-shot that a later edit cannot undo. Each
  legacy provider whose credentials are stored in the app DB becomes a connection keyed by its provider type, which
  is the key the existing `llm-metabot-provider` value already refers to. Credentials that come from an env var are
  left alone — those are synthesized into read-only connections on every read instead."
  []
  (when (nil? (setting/db-stored-value :llm-providers))
    (when-let [conns (not-empty (llm.provider/db-stored-legacy-connections))]
      (log/infof "Migrating %d LLM provider credential setting(s) to llm-providers: %s"
                 (count conns) (str/join ", " (map :key conns)))
      (llm.provider/set-connections! conns))))

(defn- add-managed-connection!
  "Ensure a connection exists for the Metabase-managed provider when this instance routes through the LLM proxy.
  It holds no credentials of its own, so it is materialized rather than configured."
  []
  (when (and (llm.provider/type-available? llm.provider/managed-connection-key)
             (nil? (llm.provider/connection llm.provider/managed-connection-key)))
    (llm.provider/set-connections!
     (conj (vec (remove #(= :env (keyword (:source %))) (llm.provider/connections)))
           {:key    llm.provider/managed-connection-key
            :type   llm.provider/managed-connection-key
            :name   "Metabase"
            :config {}}))))

(defn check-and-sync-settings-on-startup!
  "Reconcile LLM provider configuration at startup: migrate legacy per-provider credential settings onto the
  `llm-providers` connection list, materialize the managed connection when the LLM proxy is configured, and — for
  legacy `:metabot-v3` customers that do not have `:metabase-ai-managed` — switch the default unmanaged Metabot
  provider to the managed `metabase/...` provider.

  This is a migration for existing instances only: it is skipped until initial setup has completed, so fresh
  instances choose their AI provider in the setup wizard instead of booting pre-configured.

  The connection-list writes are skipped when `llm-providers` is set by an env var: the write would land in the
  app DB and then lose to the env var on every read."
  []
  (when (setup/has-user-setup)
    (when-not (setting/env-var-value :llm-providers)
      (migrate-legacy-provider-connections!)
      (add-managed-connection!))
    (maybe-sync-managed-metabot-provider!)))
