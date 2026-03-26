(ns metabase.custom-viz-plugin.settings
  (:require
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defn custom-viz-enabled?
  "Whether custom visualizations are enabled. Enabled when either:
  - The `MB_CUSTOM_VIZ_ENABLED` env var is set to true (self-hosted), or
  - The premium token includes the `:custom-viz` feature (cloud/harbormaster).

  Disabled by default to mitigate the risk of admin-access escalation
  leading to arbitrary XSS affecting all users."
  []
  (or (config/config-bool :mb-custom-viz-enabled)
      (premium-features/has-feature? :custom-viz)))

;; Expose as a public setting so the frontend can read the value.
(defsetting custom-viz-enabled
  (deferred-tru "Whether custom visualizations are enabled. For self-hosted instances, set the MB_CUSTOM_VIZ_ENABLED environment variable to true.")
  :visibility :public
  :export?    false
  :type       :boolean
  :setter     :none
  :audit      :never
  :getter     (fn [] (boolean (custom-viz-enabled?))))
