(ns metabase-enterprise.advanced-config.util.urls
  (:require [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.public-settings :as public-settings]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.util.i18n :refer [deferred-tru]]))

(defsetting pulse-url
  (deferred-tru "By default \"Site Url\" is used in notification links, but can be overridden."))

(defn site-url
  "Return the Pulse URL if set, or Site URL."
  []
  (when (premium-features/enable-advanced-config?)
    (or (pulse-url) (public-settings/site-url))))