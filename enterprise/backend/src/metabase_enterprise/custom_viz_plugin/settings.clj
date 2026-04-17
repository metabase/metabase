(ns metabase-enterprise.custom-viz-plugin.settings
  (:require
   [metabase.config.core :as config]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting custom-viz-plugin-dev-mode-enabled
  (deferred-tru "Whether custom visualization plugin dev mode is enabled. When false, the dev endpoints are disabled.")
  :type       :boolean
  :visibility :public
  :setter     :none
  :audit      :never
  :export?    false
  :getter     (fn [] (boolean (config/config-bool :mb-custom-viz-plugin-dev-mode-enabled))))
