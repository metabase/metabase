(ns metabase.embedding.validation
  (:require
   [metabase.api.common :as api]
   [metabase.embedding.settings :as embed.settings]
   [metabase.util.i18n :refer [tru]]))

(defn check-embedding-enabled
  "Is embedding of Cards or Objects (secured access via `/api/embed` endpoints with a signed JWT enabled?"
  []
  (api/check (embed.settings/enable-embedding-static)
             [400 (tru "Embedding is not enabled.")]))
