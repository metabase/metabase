(ns metabase.public-sharing.validation
  (:require
   [metabase.api.common :as api]
   [metabase.public-sharing.settings :as public-sharing.settings]
   [metabase.util.i18n :refer [tru]]))

(defn check-public-sharing-enabled
  "Check that the `public-sharing-enabled` Setting is `true`, or throw a `400`."
  []
  (api/check (public-sharing.settings/enable-public-sharing)
             [400 (tru "Public sharing is not enabled.")]))
