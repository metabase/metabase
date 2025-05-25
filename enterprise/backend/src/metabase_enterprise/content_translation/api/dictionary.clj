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

(defn- collect-row-format-error
  "Returns an error message if a row does not have the expected format."
  [row-index row]
  (when-not (= (count row) 3)
    (tru "Row {0}: Invalid format. Expected exactly 3 columns (Language, String, Translation)" (+ row-index 2))))

(defn- collect-locale-error
  "Returns an error message if a row does not have a valid locale."
  [row-index locale]
  (when (not (i18n/available-locale? locale))
    (tru "Row {0}: Invalid locale: {1}" (+ row-index 2) locale)))

(defn- collect-duplication-error
  "Returns an error message if this translation key has already been seen in the file. A translation key is a string like 'de,Category'"
  [seen-keys translation-key row-index locale trimmed-msgid]
  (when (contains? seen-keys translation-key)
    (tru "Row {0}: The string \"{1}\" is translated into locale \"{2}\" earlier in the file"
         (+ row-index 2) trimmed-msgid locale)))

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

(defn is-msgstr-usable
  "Check if the translation string is usable. It should not be blank or contain only commas, whitespace, or semicolons."
  [msgstr]
  (not
   (or
    (str/blank? msgstr)
    (re-matches #"^[,;\s]*$" msgstr))))

(defn- row-has-correct-number-of-fields
  "Checks if a row has the expected format with exactly 3 columns."
  [row]
  (= (count row) 3))

(defn- validate-row
  "Validate a single row of CSV data, returning errors and the updated set of seen translation keys."
  [row-index row seen-keys]
  (let [[locale msgid _msgstr] row
        trimmed-msgid (str/trim msgid)
        translation-key (str locale "," trimmed-msgid)]
    (if-let [format-error (collect-row-format-error row-index row)]
      ;; If the row format is invalid, just return that error
      {:errors [format-error] :seen-keys (conj seen-keys translation-key)}
      ;; Otherwise check for other potential errors
      (let [errors (remove nil?
                           [(collect-duplication-error seen-keys translation-key row-index locale trimmed-msgid)
                            (collect-locale-error row-index locale)])]
        {:errors errors :seen-keys (conj seen-keys translation-key)}))))

(defn import-translations!
  "Import translations from CSV and insert or update rows in the content_translation table."
  [{:keys [file]}]
  (with-open [reader (io/reader file)]
    ; Validate all rows before proceeding
    (let [csv-data (read-csv-file reader)
          errors (seq
                  (:errors (reduce (fn [{:keys [seen-keys] :as m} [row-index row]]
                                     (let [{row-errors :errors updated-seen-keys :seen-keys} (validate-row row-index row seen-keys)]
                                       (-> m
                                           (update :seen-keys #(apply conj %1 %2) updated-seen-keys)
                                           (update :errors #(apply conj %1 %2) row-errors))))
                                   {:seen-keys #{}
                                    :errors []}
                                   (map-indexed vector csv-data))))
          _ (when (seq errors)
              (throw (ex-info (tru "The file could not be uploaded due to the following error(s):")
                              {:status-code http-status-unprocessable
                               :errors errors})))
          usable-rows (for [[locale msgid msgstr] csv-data
                            :let [trimmed-msgid (str/trim msgid)
                                  trimmed-msgstr (str/trim msgstr)]
                            :when (is-msgstr-usable trimmed-msgstr)]
                        {:locale locale :msgid trimmed-msgid :msgstr trimmed-msgstr})]
      (t2/with-transaction [_tx]
        ;; Replace all existing entries
        (t2/delete! :model/ContentTranslation)
        ;; Insert all usable rows at once
        (when-not (empty? usable-rows)
          (t2/insert! :model/ContentTranslation usable-rows))))))
