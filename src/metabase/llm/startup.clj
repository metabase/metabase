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
   :name   "Metabase"
   :config {}})

(defn- ensure-managed-connection!
  "Materialize the connection for the Metabase-managed provider. It holds no credentials of its own, so it exists
  purely so that a `metabase/...` model reference resolves."
  []
  (when-not (llm.provider/connection llm.provider/managed-connection-key)
    (llm.provider/set-connections!
     (conj (vec (remove #(= :env (keyword (:source %))) (llm.provider/connections)))
           (managed-connection)))))

(defn- sync-managed-metabot-provider!
  []
  (let [raw-provider (setting/db-stored-value :llm-metabot-provider)
        configured?  (metabot.settings/llm-metabot-configured?)]
    (if (and (str/blank? raw-provider)
             (not configured?))
      (do
        (log/infof "Configuring llm-metabot-provider to %s for legacy Metabot entitlement"
                   metabot.settings/default-metabase-llm-metabot-provider)
        (ensure-managed-connection!)
        (setting/set! :llm-metabot-provider metabot.settings/default-metabase-llm-metabot-provider))
      nil)))

(defn- maybe-sync-managed-metabot-provider!
  []
  (let [legacy-result  (premium-features/canonically-has-feature? :metabot-v3)
        managed-result (premium-features/canonically-has-feature? :metabase-ai-managed)]
    (cond
      (or (nil? legacy-result) (nil? managed-result))   nil
      (and legacy-result (not managed-result))          (sync-managed-metabot-provider!))))

(defn- adopt-db-stored-single-provider-settings!
  "Fold per-provider credentials that were saved into the app DB onto `llm-providers`.

  Runs only when `llm-providers` has never been written, so it is a one-shot that a later edit cannot undo. Each
  provider whose credentials are stored in the app DB becomes a connection keyed by its provider type, which is the
  key the existing `llm-metabot-provider` value already refers to.

  Credentials that come from a `MB_LLM_*` env var are deliberately not copied here. Configuring a provider that way
  stays supported, and those connections are resolved from the environment on every read, so an admin who edits one
  of those variables gets the new value rather than a stale copy taken at whichever startup ran this first.

  An instance already pointed at the managed provider gets a `metabase` connection too: it carries no credentials of
  its own, but the model reference naming it has to resolve to something."
  []
  (when (nil? (setting/db-stored-value :llm-providers))
    (when-let [conns (not-empty
                      (cond-> (llm.provider/db-stored-single-provider-connections)
                        (llm.provider/managed-model-ref? (setting/db-stored-value :llm-metabot-provider))
                        (conj (managed-connection))))]
      (log/infof "Adopting %d app-DB LLM provider credential setting(s) into llm-providers: %s"
                 (count conns) (str/join ", " (map :key conns)))
      (llm.provider/set-connections! conns))))

(defn check-and-sync-settings-on-startup!
  "Reconcile LLM provider configuration at startup: adopt app-DB per-provider credential settings onto the
  `llm-providers` connection list, and — for legacy `:metabot-v3` customers that do not have
  `:metabase-ai-managed` — switch the default unmanaged Metabot provider to the managed `metabase/...` provider.

  This is a migration for existing instances only: it is skipped until initial setup has completed, so fresh
  instances choose their AI provider in the setup wizard instead of booting pre-configured.

  The connection-list writes are skipped when `llm-providers` is set by an env var: the write would land in the
  app DB and then lose to the env var on every read."
  []
  (when (setup/has-user-setup)
    (when-not (setting/env-var-value :llm-providers)
      (adopt-db-stored-single-provider-settings!))
    (maybe-sync-managed-metabot-provider!)))
