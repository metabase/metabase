(ns metabase.lib.content-translation
  "Utilities for translating user-generated content"
  (:require
   [clojure.string :as str]))

;; NOTE: Following longstanding convention, a 'msgid' is an untranslated
;; string, and a 'msgstr' is a translation of a msgid. See
;; https://www.gnu.org/software/gettext/manual/html_node/PO-Files.html

(def content-translations
  "This atom holds content translations - i.e., a dictionary of translations of user-generated strings into the user's current locale"
  (atom {}))

(def locale
  "This atom holds the active locale. It's a string"
  (atom nil))

(defn- get-content-translations
  "Get the current content translation dictionary from an atom that is set in
  the FE. This dictionary is a map of user-generated strings to their
  translations in the user's current locale."
  ([]
   (get-content-translations nil))

  ([locale]
   (let [translations @content-translations]
     (if locale
       (get translations locale [])
       []))))

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
  (reset! content-translations dict))

(defn set-locale
  "Set the locale."
  ; TODO: Normalize locale using a cljs version of i18n/normalized-locale-string?
  [new-locale]
  (reset! locale new-locale))

(defn translate-content-string
  "Translate the given string using the content-translation dictionary."
  [msgid]
  (let [translation (some #(and (= (:msgid %) (str/trim msgid))
                                (= (:locale %) @locale))
                          @content-translations)]
    (if translation
      (:msgstr translation)
      msgid)))
