(ns metabase.store-api.settings
  (:require
   [metabase.config.core :as config]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defn- default-to-staging?
  "It's against the rules to use setting values on namespace load, since they need the app DB to be loaded, and it isn't
  yet. So this is here so we can define default values for the settings below based on the env var value
  of [[store-use-staging]]."
  []
  (if-some [env-var-value (config/config-bool :mb-store-use-staging)]
    env-var-value
    (or config/is-dev? config/is-e2e?)))

(defsetting store-api-url
  (deferred-tru "Store API URL.")
  :type       :string
  :encryption :no
  :visibility :internal
  :default    (str "https://store-api" (when (default-to-staging?) ".staging") ".metabase.com")
  :doc        false
  :export?    false)
