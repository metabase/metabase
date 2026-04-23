(ns metabase-enterprise.custom-viz-plugin.settings
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

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
  :audit      :getter)

(defenterprise enable-custom-viz?
  "Enterprise implementation: custom visualizations are enabled when the admin has opted in via the
  `custom-viz-enabled` setting and the instance's token includes the `:custom-viz` premium feature."
  :feature :custom-viz
  []
  (boolean (custom-viz-enabled)))
