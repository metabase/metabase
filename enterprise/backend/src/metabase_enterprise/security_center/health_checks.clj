(ns metabase-enterprise.security-center.health-checks
  "The Security Center health checks: the registry of checks, and the run of one check into the `HealthCheck` the API
  returns.

  A check is one entry in the registry, with the texts as deferred translations and two zero-argument functions,
  `:applicable?` and `:run`. The registry is read through [[all-checks]], [[check-by-id]]
  and [[check-ids]] only, so the way it is stored can change without touching its callers."
  (:require
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::entry
  "One check as registered: the texts and the docs link the API returns, and the functions that compute the check.
  `:applicable?` says whether the check is returned at all. `:run` computes the items and is always fast.
  `:refresh` is the slow work of a background check; it stores a result that `:run` reads."
  [:map {:closed true}
   [:id                ::security-center.schema/health-check-id]
   [:severity          ::security-center.schema/severity]
   [:title             ms/LocalizedString]
   [:description       ms/LocalizedString]
   [:remediation       ms/LocalizedString]
   [:docs-page         ms/NonBlankString]
   [:docs-anchor       {:optional true} ms/NonBlankString]
   [:requires-restart? :boolean]
   [:applicable?       fn?]
   [:run               fn?]
   [:refresh           {:optional true} fn?]])

(mr/def ::items
  "What `:run` returns: at least one item, so a check always reports something."
  [:sequential {:min 1} ::security-center.schema/health-check-item])

(mr/def ::registry
  [:map-of ::security-center.schema/health-check-id ::entry])

(mu/defn- validated-registry :- ::registry
  "Returns `registry` once every key is its entry's `:id`. With the schema on the argument, a wrong entry fails when
  the namespace loads, not when the first request arrives."
  [registry :- ::registry]
  (doseq [[id entry] registry
          :when (not= id (:id entry))]
    (throw (ex-info (format "Health check %s is registered under %s" (:id entry) id)
                    {:key id, :id (:id entry)})))
  registry)

;;; Items

(defn- item
  [status message]
  {:status status, :message (str message)})

(defn- pass-or-fail
  [ok? pass-message fail-message]
  (if ok?
    (item :pass pass-message)
    (item :fail fail-message)))

;;; The checks

(def ^:private encryption-secret-key
  {:id                :encryption-secret-key
   :severity          :high
   :title             (deferred-tru "Encryption secret key")
   :description       (deferred-tru "MB_ENCRYPTION_SECRET_KEY encrypts the database connection details in the app DB.")
   :remediation       (deferred-tru "Set MB_ENCRYPTION_SECRET_KEY and restart Metabase.")
   :docs-page         "databases/encrypting-details-at-rest"
   :requires-restart? true
   :applicable?       (constantly true)
   :run               (fn []
                        [(pass-or-fail (encryption/default-encryption-enabled?)
                                       (tru "MB_ENCRYPTION_SECRET_KEY is set")
                                       (tru "MB_ENCRYPTION_SECRET_KEY is not set"))])})

(def ^:private session-secret-key
  {:id                :session-secret-key
   :severity          :high
   :title             (deferred-tru "Session secret key")
   :description       (deferred-tru "MB_SESSION_SECRET_KEY signs the session cookies.")
   :remediation       (deferred-tru "Set MB_SESSION_SECRET_KEY and restart Metabase.")
   :docs-page         "configuring-metabase/environment-variables"
   :docs-anchor       "mb_session_secret_key"
   :requires-restart? true
   :applicable?       (constantly true)
   :run               (fn []
                        ;; [[config/config-str]] returns nil for a blank value. The value itself never reaches an item.
                        [(pass-or-fail (some? (config/config-str :mb-session-secret-key))
                                       (tru "MB_SESSION_SECRET_KEY is set")
                                       (tru "MB_SESSION_SECRET_KEY is not set"))])})

(def ^:private legacy-startup-encryption
  {:id                :legacy-startup-encryption
   :severity          :medium
   :title             (deferred-tru "Legacy startup encryption")
   :description       (deferred-tru "MB_DISABLE_LEGACY_STARTUP_ENCRYPTION turns off the older way to decrypt settings at startup.")
   :remediation       (deferred-tru "Set MB_DISABLE_LEGACY_STARTUP_ENCRYPTION to true and restart Metabase.")
   :docs-page         "configuring-metabase/environment-variables"
   :docs-anchor       "mb_disable_legacy_startup_encryption"
   :requires-restart? true
   :applicable?       (constantly true)
   :run               (fn []
                        [(pass-or-fail (true? (config/config-bool :mb-disable-legacy-startup-encryption))
                                       (tru "MB_DISABLE_LEGACY_STARTUP_ENCRYPTION is true")
                                       (tru "MB_DISABLE_LEGACY_STARTUP_ENCRYPTION is not true"))])})

;;; The registry

(def ^:private checks
  "The registry: one entry per check, keyed by its id. Read it through [[all-checks]], [[check-by-id]] and
  [[check-ids]]."
  (validated-registry
   {:encryption-secret-key     encryption-secret-key
    :session-secret-key        session-secret-key
    :legacy-startup-encryption legacy-startup-encryption}))

(defn all-checks
  "Every registered check, in id order."
  []
  (sort-by :id (vals checks)))

(defn check-by-id
  "The registered check with `id`, or nil."
  [id]
  (get checks id))

(defn check-ids
  "The id of every registered check, in id order."
  []
  (sort (keys checks)))

(mu/defn status-of :- ::security-center.schema/health-check-status
  "The status of a check from its items: any item fails → fail; else any item unknown → unknown; else pass."
  [items :- [:sequential ::security-center.schema/health-check-item]]
  (let [statuses (into #{} (map :status) items)]
    (cond
      (statuses :fail)    :fail
      (statuses :unknown) :unknown
      :else               :pass)))

(mu/defn applicable? :- :boolean
  "Whether `entry` is returned at all. A throw counts as applicable, so an error shows up as an unknown check instead
  of hiding the check."
  [{:keys [id applicable?]} :- ::entry]
  (try
    (boolean (applicable?))
    (catch Throwable e
      (log/errorf e "Health check %s could not tell whether it applies" (name id))
      true)))

(defn- unknown-item
  [message]
  {:status :unknown, :message (str message)})

(mu/defn- run-items :- ::items
  "The items of `entry`'s `:run`. A throw, an empty result and an item outside the schema each become one unknown
  item with a message, so a broken check reports itself and leaves the other checks alone."
  [{:keys [id run]} :- ::entry]
  (try
    (mu/validate-throw ::items (vec (run)))
    (catch Throwable e
      (log/errorf e "Health check %s failed" (name id))
      [(unknown-item (tru "The check could not run: {0}" (ex-message e)))])))

(mu/defn run-check :- ::security-center.schema/health-check
  "Runs `entry` and returns the `HealthCheck` the API serves: the texts in the current user's locale, the items of this
  run, and the status that [[status-of]] derives from them."
  [{:keys [id severity title description remediation docs-page docs-anchor requires-restart?] :as entry} :- ::entry]
  (let [items (run-items entry)]
    {:id               id
     :severity         severity
     :title            (str title)
     :description      (str description)
     :remediation      (str remediation)
     :docs             (cond-> {:page docs-page}
                         docs-anchor (assoc :anchor docs-anchor))
     :requires_restart requires-restart?
     :status           (status-of items)
     :running          false
     :checked_at       (t/offset-date-time)
     :items            items}))

(mu/defn run-checks :- [:sequential ::security-center.schema/health-check]
  "Runs every registered check that applies, in id order."
  []
  (into []
        (comp (filter applicable?)
              (map run-check))
        (all-checks)))
