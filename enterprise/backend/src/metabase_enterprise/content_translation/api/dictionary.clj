(ns metabase-enterprise.content-translation.api.dictionary
  "Implementation of dictionary upload and retrieval logic for content translations"
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- read-csv-file
  "Read CSV file content, skipping the header row. Throws a formatted exception if parsing fails."
  [reader]
  (try
    (rest (csv/read-csv reader))
    (catch Exception e
      (log/error e "Error parsing CSV file")
      (throw (ex-info (tru "Please upload a valid CSV file.")
                      {:status-code 422
                       :errors [(tru "Invalid CSV format: {0}" (.getMessage e))]})))))

(defn is-msgstr-usable
  "Check if the translation string is usable. It should not be blank or contain only commas, whitespace, or semicolons."
  [msgstr]
  (not
   (or
    (str/blank? msgstr)
    (re-matches #"^[,;\s]*$" msgstr))))

(defn import-translations!
  "Import translations from CSV and insert or update rows in the content_translation table."
  [{:keys [file]}]
  (with-open [reader (io/reader file)]
    (let [csv-data (read-csv-file reader)
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
