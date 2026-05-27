(ns metabase-enterprise.data-app-demo.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting data-app-demo-dev-bundle-url
  (deferred-tru "URL Metabase will proxy the data-app demo bundle from. Used for live dev workflows where the bundle file is exposed via ngrok or similar. When blank, the built-in resource bundle is served instead.")
  :type       :string
  :default    nil
  :visibility :admin
  :encryption :no
  :audit      :never
  :export?    false)
