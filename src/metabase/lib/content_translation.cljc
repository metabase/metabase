(ns metabase.lib.content-translation
  [:require
   [metabase.util.log :as log]])

(def content-translations
  "This atom holds content translations - i.e., a dictionary of translations of user-generated strings into the user's current locale"
  (atom {}))

(defn get-content-translations
  "Get the current content translations. This is a map of user-generated strings to their translations in the user's current locale."
  []
  @content-translations)

(defn set-content-translations
  "Set the current content-translation dictionary."
  [m]
  (reset! content-translations m))
