(ns metabase.content-translation.api
  "Public API for content translation functionality."
  (:require
   [metabase.content-translation.models :as models]))

(defn get-translations
  "List the translations stored in the content_translation table.
  Optionally filter by locale if a locale parameter is provided."
  ([]
   (models/get-translations))
  ([locale]
   (models/get-translations locale)))