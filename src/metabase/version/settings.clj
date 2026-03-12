(ns metabase.version.settings
  (:require
   [metabase.config.core :as config]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]))

(defsetting version
  "Metabase's version info"
  :visibility :public
  :setter     :none
  :getter     (constantly config/mb-version-info)
  :doc        false)

(defsetting check-for-updates
  (deferred-tru "Identify when new versions of Metabase are available.")
  :type    :boolean
  :audit   :getter
  :default true)

(defsetting upgrade-threshold
  (deferred-tru "Threshold (value in 0-100) indicating at which threshold it should offer an upgrade to the latest major version.")
  :visibility :internal
  :export?    false
  :type       :integer
  :setter     :none
  :getter     (fn []
                ;; site-uuid is stable, current-major lets the threshold randomize during each major revision. So they
                ;; might be early one release, and then later the next.
                (-> (system/site-uuid) (str "-" (config/current-major-version)) hash (mod 100))))

(defn- prevent-upgrade?
  "On a major upgrade, we check the rollout threshold to indicate whether we should remove the latest release from the
  version info. This lets us stage upgrade notifications to self-hosted instances in a controlled manner. Defaults to
  show the upgrade except under certain circumstances."
  [current-major latest threshold]
  (when (and (integer? current-major) (integer? threshold) (string? (:version latest)))
    (try (let [upgrade-major (-> latest :version config/major-version)
               rollout       (some-> latest :rollout)]
           (when (and upgrade-major rollout)
             (cond
               ;; it's the same or a minor release
               (= upgrade-major current-major) false
               ;; the rollout threshold is larger than our threshold
               (>= rollout threshold) false
               :else true)))
         (catch Exception _e true))))

(defsetting site-uuid-for-version-info-fetching
  "A *different* site-wide UUID that we use for the version info fetching API calls. Do not use this for any other
  applications. (See [[metabase.premium-features.settings/site-uuid-for-premium-features-token-checks]] for more
  reasoning.)"
  :encryption :when-encryption-key-set
  :visibility :internal
  :base       setting/uuid-nonce-base)

(defn- version-info*
  [raw-version-info {:keys [current-major upgrade-threshold-value]}]
  (try
    (cond-> raw-version-info
      (prevent-upgrade? current-major (-> raw-version-info :latest) upgrade-threshold-value)
      (dissoc :latest))
    (catch Exception e
      (log/error e "Error processing version info")
      raw-version-info)))

(defsetting version-info
  (deferred-tru "Information about available versions of Metabase.")
  :encryption :no
  :type       :json
  :audit      :never
  :default    {}
  :doc        false
  :getter     (fn []
                (let [raw-vi (setting/get-value-of-type :json :version-info)
                      current-major (config/current-major-version)]
                  (version-info* raw-vi {:current-major current-major :upgrade-threshold-value (upgrade-threshold)})))
  :include-in-list? false)

(defsetting version-info-last-checked
  (deferred-tru "Indicates when Metabase last checked for new versions.")
  :visibility :public
  :type       :timestamp
  :audit      :never
  :default    nil
  :doc        false)

(defsetting deprecation-notice-version
  (deferred-tru "Metabase version for which a notice about usage of deprecated features has been shown.")
  :encryption :no
  :visibility :admin
  :doc        false
  :audit      :never)
