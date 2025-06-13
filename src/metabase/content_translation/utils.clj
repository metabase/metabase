(ns metabase.content-translation.utils
  (:require
   [clojure.string :as str]
   [metabase.content-translation.models :as ct]
   [metabase.util.i18n :as i18n]))

(defn- translate-content-string
  "Translate the given string using the content-translation dictionary."
  [msgid]
  (let [locale (i18n/user-locale-string)
        translations (ct/get-translations locale)
        translation (some #(when (= (:msgid %) (str/trim msgid)) %) translations)]
    (if translation
      (:msgstr translation)
      msgid)))

(defn translate-column-display-name
  "Update column metadata to use the content-translation dictionary to translate the column's display name"
  [column-metadata]
  (assoc column-metadata :display_name (translate-content-string (get column-metadata :display_name))))
