(ns metabase-enterprise.custom-viz-plugin.settings
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.server.settings :as server.settings]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(defsetting custom-viz-plugin-dev-mode-enabled
  (deferred-tru "Whether custom visualization plugin dev mode is enabled. When false, the dev endpoints are disabled.")
  :type       :boolean
  :default    false
  :visibility :public
  :setter     :none
  :audit      :never
  :export?    false)

(defsetting custom-viz-enabled
  (deferred-tru "Should custom visualizations be enabled for this instance?")
  :type       :boolean
  :default    false
  :feature    :custom-viz
  :visibility :admin
  :export?    true
  :audit      :getter
  :setter     (fn [new-value]
                (let [coerced (if (string? new-value)
                                (setting/string->boolean new-value)
                                (boolean new-value))]
                  (when (and (true? coerced)
                             (not (server.settings/csp-img-enabled)))
                    (throw (ex-info (tru "Turn on the image CSP setting before enabling Custom Visualizations.")
                                    {:status-code 400})))
                  (setting/set-value-of-type! :boolean :custom-viz-enabled coerced))))

(defenterprise enable-custom-viz?
  "Enterprise implementation: custom visualizations are enabled when the admin has opted in via the
  `custom-viz-enabled` setting and the instance's token includes the `:custom-viz` premium feature."
  :feature :custom-viz
  []
  (boolean (custom-viz-enabled)))
