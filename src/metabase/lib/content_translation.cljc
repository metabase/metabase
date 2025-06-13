(ns metabase.lib.content-translation
  (:require
   [clojure.string :as str]
   [metabase.content-translation.models :as ct]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]))

(def content-translations
  "This atom holds content translations - i.e., a dictionary of translations of user-generated strings into the user's current locale"
  (atom {}))

(defn- get-content-translations
  "Get the current content translation dictionary from an atom that is set in
  the FE. This dictionary is a map of user-generated strings to their
  translations in the user's current locale."
  []
  (log/info "In content_translation.cljc, content translations =" (pr-str @content-translations))
  @content-translations)

; (defn- get-content-translation-from-table
;   "Get the current content translation dictionary directly from the app db table."
;   [msgid]
;   (log/info "translation from table-based func:" (get (ct/get-translations "de") (str/trim msgid) msgid))
;   (get (ct/get-translations) msgid msgid))

(defn- get-content-translation-from-table
  "Get the current content translation based on msgid from the app db table"
  [msgid]
  (let [locale (i18n/user-locale-string)
        translations (ct/get-translations locale)
        translation (some #(when (= (:msgid %) (str/trim msgid)) %) translations)]
    (log/info "translation found:" translation)
    (if translation
      (:msgstr translation)
      msgid)))

;; TODO: Refactor this away if possible
;; I don't understand why both the clj and cljs forms are needed
(defn get-field-value
  "Retrieve a value from a map-like JavaScript object."
  [obj field default-value]
  (if (some? obj)
    (let [field-key (if (keyword? field) field (keyword field))]
      #?(:clj  (get obj field-key default-value)
         :cljs (let [field-str (name field)]
                 (or (aget obj field-str) default-value))))
    default-value))

(defn get-content-translation
  "Get content translation of the string, if one exists. Otherwise, return the string untranslated."
  [msgid]
  (get-field-value (get-content-translations) msgid msgid))

(defn set-content-translations
  "Set the current content-translation dictionary."
  [dict]
  (log/info "In content_translation.cljc, setting content translations to" (pr-str dict))
  (reset! content-translations dict)
  (log/info "get-content-translations= " (pr-str (get-content-translations)))
  (log/info "type of 'Created At'" (type "Created At"))
  (log/info (str "WHOA translation of Created At: " (get-field-value (get-content-translations) "Created At" "default value"))))

(defn translate-display-names-in-column-metadata
  [column-metadata]
  (log/info "column metadata is" column-metadata)
  (log/info "display name is" (get column-metadata :display_name))
  (log/info "type of display name is" (type (get column-metadata :display_name)))
  (log/info "translation is"
            (get-content-translation-from-table (get column-metadata :display_name)))
  (log/info "type of translation is"
            (type (get-content-translation-from-table (get column-metadata :display_name))))
  (assoc column-metadata :display_name (get-content-translation-from-table (get column-metadata :display_name))))
