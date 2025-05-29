(ns metabase-enterprise.content-translation.dictionary
  "Implementation of dictionary upload and retrieval logic for content translations"
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :as i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private http-status-unprocessable 422)

(defn- translation-key
  "The identity of a translation. It's locale and source string so we can identify if the same translation is present
  multiple times."
  [t]
  (select-keys t [:locale :msgid]))

(defn- adjust-index
  "Adjust index: increment once for the header row that was chopped off and again to go to 1-based indexing for human
  consumption."
  [i]
  (+ i 2))

(defn- collect-locale-error
  "Returns an error message if a row does not have a valid locale."
  [_state index {:keys [locale]}]
  (when (not (i18n/available-locale? locale))
    (tru "Row {0}: Invalid locale: {1}" (adjust-index index) locale)))

(defn- collect-duplication-error
  "Returns an error message if this translation key has already been seen in the file. A translation key is a string
  like 'de,Category'"
  [{:keys [seen] :as _state} index {:keys [msgid locale] :as translation}]
  (when (-> translation translation-key seen)
    (tru "Row {0}: The string \"{1}\" is translated into locale \"{2}\" earlier in the file"
         (adjust-index index) msgid locale)))

(defn- is-msgstr-usable
  "Check if the translation string is usable. It should not be blank or contain only commas, whitespace, or semicolons."
  [msgstr]
  (not
   (or
    (str/blank? msgstr)
    (re-matches #"^[,;\s]*$" msgstr))))

(defn- row-errors
  [state index translation]
  (keep (fn [f] (f state index translation))
        [collect-duplication-error collect-locale-error]))

(defn- wrong-row-shape
  [index]
  (tru "Row {0}: Invalid format. Expected exactly 3 columns (Language, String, Translation)"
       (adjust-index index)))

(defn- process-rows
  "Format, trim, validate rows. Takes the vectors from a csv and returns a map with the shape
  {:translations [{:locale :msgid :msgstr}]
   :errors       [string]}.
  The :seen set is returned but not meant for consumption."
  [rows]
  (reduce (fn [state [index row]]
            (let [[locale msgid msgstr & extra] row
                  translation                   {:locale locale
                                                 :msgid  (str/trim msgid)
                                                 :msgstr (str/trim msgstr)}
                  errors                        (cond-> (row-errors state index translation)
                                                  (seq extra) (conj (wrong-row-shape index)))]
              (cond-> (-> state
                          (update :seen conj (dissoc translation :msgstr))
                          (update :translations conj translation))
                (seq errors) (update :errors into errors))))
          {:seen         #{}
           :errors       []
           :translations []}
          (map-indexed vector rows)))

(defn import-translations!
  "Import translations from CSV and insert or update rows in the content_translation table."
  [rows]
  (let [{:keys [translations errors]} (process-rows rows)]
    (when (seq errors)
      (throw (ex-info (tru "The file could not be uploaded due to the following error(s):")
                      {:status-code http-status-unprocessable
                       :errors errors})))
    ;; remove bad msgstrs after error generator for line number reporting reasons
    (let [usable-rows (filter (comp is-msgstr-usable :msgstr) translations)]
      (t2/with-transaction [_tx]
        ;; Replace all existing entries
        (t2/delete! :model/ContentTranslation)
        ;; Insert all usable rows at once
        (when-not (empty? usable-rows)
          (t2/insert! :model/ContentTranslation usable-rows))))))
