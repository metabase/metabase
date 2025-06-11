(ns metabase.lib.content-translation
  (:require
   [metabase.util.log :as log]))

(def content-translations
  "This atom holds content translations - i.e., a dictionary of translations of user-generated strings into the user's current locale"
  (atom {}))

(defn- get-content-translations
  "Get the current content translations. This is a map of user-generated strings to their translations in the user's current locale."
  []
  (log/info "In content_translation.cljc, content translations =" (pr-str @content-translations))
  @content-translations)

;; TODO: Refactor this away
(defn get-field-value
  "Retrieve a value from a map-like JavaScript object."
  [obj field default-value]
  (if (some? obj)
    (let [field-str (name field)]
      (or (aget obj field-str) default-value))
    default-value))

(defn get-content-translation
  "Get content translation of the string, if one exists. Otherwise, return the string untranslated."
  [s]
  (get-field-value (get-content-translations) s s))

(defn set-content-translations
  "Set the current content-translation dictionary."
  [m]
  (log/info "In content_translation.cljc, setting content translations to" (pr-str m))
  (reset! content-translations m))
