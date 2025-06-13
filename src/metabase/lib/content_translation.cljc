(ns metabase.lib.content-translation)

(def content-translations
  "This atom holds content translations - i.e., a dictionary of translations of user-generated strings into the user's current locale"
  (atom {}))

(defn- get-content-translations
  "Get the current content translation dictionary from an atom that is set in
  the FE. This dictionary is a map of user-generated strings to their
  translations in the user's current locale."
  []
  @content-translations)

(defn get-field-value
  "Retrieve a value from a map-like JavaScript object."
  [obj field default-value]
  (if (some? obj)
    (or (aget obj (name field)) default-value)
    default-value))

(defn get-content-translation
  "Get content translation of the string, if one exists. Otherwise, return the string untranslated."
  [msgid]
  (get-field-value (get-content-translations) msgid msgid))

(defn set-content-translations
  "Set the current content-translation dictionary."
  [dict]
  (reset! content-translations dict))
