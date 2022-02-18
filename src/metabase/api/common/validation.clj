(ns metabase.api.common.validation
  (:require
   [metabase.api.common :as api]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :as ui18n :refer [tru]]))

;; TODO: figure out what other functions to move here from metabase.api.common

(defn check-public-sharing-enabled
  "Check that the `public-sharing-enabled` Setting is `true`, or throw a `400`."
  []
  (api/check (public-settings/enable-public-sharing)
    [400 (tru "Public sharing is not enabled.")]))

(defn check-embedding-enabled
  "Is embedding of Cards or Objects (secured access via `/api/embed` endpoints with a signed JWT enabled?"
  []
  (api/check (public-settings/enable-embedding)
    [400 (tru "Embedding is not enabled.")]))
