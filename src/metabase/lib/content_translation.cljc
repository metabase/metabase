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
  [s]
  ;; TODO: For testing
  (if (= s "Created At")
    "Erstellt Am"
    (get-field-value (get-content-translations) s s)))

(defn set-content-translations
  "Set the current content-translation dictionary."
  [m]
  (log/info "In content_translation.cljc, setting content translations to" (pr-str m))
  (reset! content-translations m)
  (log/info "get-content-translations= " (pr-str (get-content-translations)))
  (log/info (str "WHOA translation of Created At: " (get-field-value (get-content-translations) "Created At" "default value"))))

(defn translate-display-names-in-column-metadata
  [column-metadata]
  (log/info "column metadata is" column-metadata)
  (log/info "display name is" (get column-metadata :display_name))
  (log/info "type of display name is" (type (get column-metadata :display_name)))
  (log/info "translation is"
            (get-content-translation (get column-metadata :display_name)))
  (log/info "type of translation is"
            (type (get-content-translation (get column-metadata :display_name))))
  (assoc column-metadata :display_name (get-content-translation (get column-metadata :display_name))))
