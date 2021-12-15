(ns metabase-enterprise.embedding.utils
  (:require [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.public-settings :as public-settings]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.util.i18n :refer [deferred-tru]]))

(defsetting pulse-url
  (deferred-tru "By default \"Site Url\" is used in notification links, but can be overridden.")
  :getter (fn []
            (when (premium-features/hide-embed-branding?)
              (or (setting/get-string :pulse-url) (public-settings/site-url)))))
