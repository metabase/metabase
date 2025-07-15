(ns metabase-enterprise.content-translation.dictionary
  "Implementation of dictionary upload and retrieval logic for content translations"
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
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
  (when (not (i18n/included-locale? locale))
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

(defn- format-row
  "Formats a row to be inserted into the content translation table. Locales are standardized, and all fields are trimmed. Extra fields are included as well."
  [row]
  (let [[locale msgid msgstr & extras] row
        normalized-locale (i18n/normalized-locale-string (str/trim locale))
        formatted-locale (if (nil? normalized-locale)
                           (str/trim locale)
                           normalized-locale)
        formatted-msgid (str/trim msgid)
        formatted-msgstr (str/trim msgstr)]
    (into [formatted-locale formatted-msgid formatted-msgstr]
          extras)))

(defn- row-errors
  [state index translation]
  (keep (fn [f] (f state index translation))
        [collect-duplication-error collect-locale-error]))

(defn- wrong-row-shape
  [index]
  (tru "Row {0}: Invalid format. Expected exactly 3 columns (Language, String, Translation)"
       (adjust-index index)))

(defn- header?
  "Checks if a row is likely a by checking if it begins with language or locale works with both unparsed strings
  and vectors"
  [row]
  (cond
    (string? row)
    (let [downcased (u/lower-case-en row)]
      (or (str/starts-with? downcased "locale")
          (str/starts-with? downcased "language")))
    (vector? row)
    (contains? #{"locale" "language"} (u/lower-case-en (first row)))))

(defn- process-rows
  "Format, validate, and process rows from a CSV. Takes a collection of vectors and returns a map with the shape
  {:translations [{:locale :msgid :msgstr}], :errors [string]}, plus the set :seen for internal use."
  [rows]
  (letfn [(collect-translation-and-errors [state index row]
            (let [[locale msgid msgstr & extra] row
                  translation {:locale locale :msgid msgid :msgstr msgstr}
                  errors (row-errors state index translation)
                  errors (if (seq extra)
                           (conj errors (wrong-row-shape index))
                           errors)]
              (-> state
                  (update :seen conj (dissoc translation :msgstr))
                  (update :translations conj translation)
                  (update :errors into errors))))]
    (let [[maybe-header & rest] rows
          formatted-rows (map format-row (if (header? maybe-header)
                                           rest
                                           rows))]
      (reduce-kv collect-translation-and-errors
                 {:seen         #{}
                  :errors       []
                  :translations []}
                 (vec formatted-rows)))))

(defn- import-translations!
  "Insert or update rows in the content_translation table."
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

(defn- maybe-read
  [reader]
  (let [lines (line-seq reader)]
    (import-translations!
     (for [[i line] (map-indexed vector lines)]
       (try
         (first (csv/read-csv (java.io.StringReader. line)))
         (catch Exception e
           (let [error-message (.getMessage ^Exception e)
                 error-message (if (and (zero? i) (header? line))
                                 (tru "Header row: {0}" error-message)
                                 (tru "Row {0}: {1}" i error-message))]
             (throw (ex-info
                     error-message
                     {:status-code http-status-unprocessable
                      :errors [error-message]})))))))))

(defn read-and-import-csv!
  "Read CSV and catch error if the CSV is invalid."
  [file]
  (premium-features/assert-has-feature :content-translation (tru "Content translation"))
  (with-open [reader (io/reader file)]
    (maybe-read reader)))
