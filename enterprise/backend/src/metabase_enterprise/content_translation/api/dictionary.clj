(ns metabase-enterprise.content-translation.api.dictionary
  "Implementation of dictionary upload and retrieval logic for content translations"
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private http-status-unprocessable 422)

(def ^:private max-string-length 255)

;; Maximum file size: 1.5MB
(def ^:private max-file-size (* 1.5 1024 1024))

(defn- row-has-correct-number-of-fields
  "Checks if a row has the expected format with exactly 3 columns."
  [row]
  (and (vector? row) (= (count row) 3)))

(defn- collect-row-format-error
  "Returns an error message if a row does not have the expected format."
  [row-index row]
  (when-not (row-has-correct-number-of-fields row)
    (tru "Row {0}: Invalid format. Expected exactly 3 columns (Language, String, Translation)" (+ row-index 2))))

(defn- collect-locale-error
  "Returns an error message if a row does not have a valid locale."
  [row-index locale]
  (when (and (not (str/blank? locale))
             (not (i18n/available-locale? locale)))
    (tru "Row {0}: Invalid locale: {1}" (+ row-index 2) locale)))

(defn- collect-duplication-error
  "Returns an error message if this translation key has already been seen in the file. A translation key is a string like 'de,Category'"
  [seen-keys translation-key row-index locale trimmed-msgid]
  (when (contains? seen-keys translation-key)
    (tru "Row {0}: The string \"{1}\" is translated into locale \"{2}\" earlier in the file"
         (+ row-index 2) trimmed-msgid locale)))

(defn- collect-string-length-error
  "Checks if a string is within length limits and returns an error message if not."
  [row-index field-name string-value]
  (when (and (not (str/blank? string-value))
             (> (count string-value) max-string-length))
    (tru "Row {0}: {1} exceeds maximum length of {2} characters"
         (+ row-index 2) field-name max-string-length)))

(defn- read-csv-file
  "Read CSV file content, skipping the header row. Throws a formatted exception if parsing fails."
  [reader]
  (try
    (rest (csv/read-csv reader))
    (catch Exception e
      (log/error e "Error parsing CSV file")
      (throw (ex-info (tru "Please upload a valid CSV file.")
                      {:status-code http-status-unprocessable
                       :errors [(tru "Invalid CSV format: {0}" (.getMessage e))]})))))

(defn- check-file-size
  "Check if the file size is within the maximum allowed size."
  [^File file]
  (let [file-size (.length file)]
    (when (> file-size max-file-size)
      (throw (ex-info (tru "The file could not be uploaded because it is larger than {0}MB, which is the maximum." (/ max-file-size (* 1024 1024)))
                      {:status-code http-status-content-too-large
                       :file-size file-size
                       :max-size max-file-size})))))

(defn is-msgstr-usable
  "Check if the translation string is usable. It should not be blank or contain only commas, whitespace, or semicolons."
  [msgstr]
  (not
   (or
    (str/blank? msgstr)
    (re-matches #"^[,;\s]*$" msgstr))))

(defn- validate-row
  "Validate a single row of CSV data, recording errors and updating the set of seen translation keys."
  [row-index row seen-keys]
  (let [errors (transient [])
        [locale msgid msgstr] row
        trimmed-msgid (str/trim msgid)
        trimmed-msgstr (str/trim msgstr)
        translation-key (str locale "," trimmed-msgid)]
    (when-let [format-error (collect-row-format-error row-index row)]
      (conj! errors format-error))

    (when (row-has-correct-number-of-fields row)
      (when-let [duplication-error (collect-duplication-error seen-keys translation-key row-index locale trimmed-msgid)]
        (conj! errors duplication-error))
      (when-let [locale-error (collect-locale-error row-index locale)]
        (conj! errors locale-error))
      (when-let [msgid-error (collect-string-length-error row-index "Original string" trimmed-msgid)]
        (conj! errors msgid-error))
      (when-let [msgstr-error (collect-string-length-error row-index "Translation" trimmed-msgstr)]
        (conj! errors msgstr-error)))

    {:errors (persistent! errors) :seen-keys (conj seen-keys translation-key)}))

(defn import-translations!
  "Import translations from CSV and insert or update rows in the content_translation table."
  [{:keys [file]}]
  (with-open [reader (io/reader file)]
    (check-file-size file)
    (let [csv-data (read-csv-file reader)]

      ; Validate all rows before proceeding
      (loop [rows (map-indexed vector csv-data)
             errors (transient [])
             seen-keys #{}]
        (if (seq rows)
          (let [[row-index row] (first rows)
                {row-errors :errors updated-seen-keys :seen-keys}
                (validate-row row-index row seen-keys)]
            (recur (rest rows)
                   (reduce conj! errors row-errors)
                   updated-seen-keys))

          (let [all-errors (persistent! errors)]
            (when (seq all-errors)
              (throw (ex-info (tru "The file could not be uploaded due to the following error(s):")
                              {:status-code http-status-unprocessable
                               :errors all-errors}))))))

      (let [usable-rows (for [[locale msgid msgstr] csv-data
                              :let [trimmed-msgid (str/trim msgid)
                                    trimmed-msgstr (str/trim msgstr)]
                              :when (is-msgstr-usable trimmed-msgstr)]
                          {:locale locale :msgid trimmed-msgid :msgstr trimmed-msgstr})]
        (t2/with-transaction [_tx]
          ;; Replace all existing entries
          (t2/delete! :model/ContentTranslation)
          ;; Insert all usable rows at once
          (when-not (empty? usable-rows)
            (t2/insert! :model/ContentTranslation usable-rows)))))))
