(ns metabase.query-processor.middleware.translate-content
  "Middleware for handling conversion of integers to strings for proper display of large numbers"
  (:require
   [metabase.models.content-translation :as ct]
   [metabase.util.i18n.impl :as i18n.impl]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]))

(set! *warn-on-reflection* true)

(defn- translate-row
  "Converts all large integer row values to strings."
  [rf translation-map]
  (let [lookup-translation
        (fn [msgid]
          (or (get translation-map msgid) msgid))]
    ((map (fn [row]
            (perf/mapv lookup-translation row)))
     rf)))

(defn build-translation-map
  "Build a translation map from the content_translation table"
  []
  (let [translations (ct/get-translations)
        locale (i18n.impl/site-locale-from-setting) ; TODO: support user locale
        translations-for-locale (filter #(= (:locale %) locale) translations)]
    (log/info "locale" locale)
    (log/info "Translations for locale:" translations-for-locale)
    (reduce (fn [acc {:keys [msgid msgstr]}]
              (assoc acc msgid msgstr))
            {}
            translations-for-locale)))

(defn translate-content
  "Translate content"
  [_query rff]
  (let [translation-map (build-translation-map)
        rff' (fn [metadata] (translate-row (rff metadata) translation-map))]
    (log/info "translation map:" translation-map)
    (log/info "Translating content")
    (or rff' rff)))

