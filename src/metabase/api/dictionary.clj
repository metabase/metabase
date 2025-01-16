(ns metabase.api.dictionary
  "Endpoints relating to content translation"
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [compojure.core :refer [GET]]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.async.streaming-response :as sr]
   [metabase.db.query :as mdb.query]
   [metabase.models.content-translation :as ct]
   [metabase.util.date-2 :as u.date]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io BufferedWriter OutputStreamWriter)
   (java.nio.charset StandardCharsets)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/column-names"
  "Provides the display names of all the columns, for the translation dictionary"
  []
  (ct/get-column-display-names))

(api/defendpoint GET "/table-names"
  "Provides the display names of all the tables, for the content translation dictionary"
  []
  (ct/get-table-display-names))
#_{:clj-kondo/ignore [:deprecated-var]}

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/field-values"
  "Provides all the field values, for the content translation dictionary"
  []
  (ct/get-field-value-display-names))


(defn- format-csv-to-stream [os display-names locales]
  (let [
        ; If no locales were provided, we'll write all the rows out once with an empty locale
        locales (if (empty? locales) [""] locales)
        writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))
        headers ["Language" "String" "Translation"]]
    (try
      (log/info "locales in format-csv-to-stream" locales)
      (csv/write-csv writer [headers])
      (doseq [locale locales]
        (doseq [display-name display-names]
          (csv/write-csv writer [[locale display-name ""]])))
      (.flush writer)
      (finally
        (.close writer)))))

; later: remove all the data in the content-translation table

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/csv/:locales-string"
  "Provides downloadable content translation dictionary in csv. Example URL: /csv/es-fr"
  [locales-string]
  (let [locales (str/split locales-string #"-")]
    (log/info "Received locales" locales)
    (sr/streaming-response {
                            :content-type "text/csv; charset=utf-8"
                            :status 200
                            :headers {"Content-Disposition" (format "attachment; filename=\"content_dictionary_%s.csv\""
                                                                    (u.date/format (t/zoned-date-time)))}
                            } [os canceled-chan]
                           (format-csv-to-stream os (ct/get-all-display-names) locales))))

(defn import-translations!
  "Import translations from CSV and insert or update rows in the content_translation table."
  [{:keys [_filename file]}]
  (with-open [reader (io/reader file)]
    (let [csv-data (rest (csv/read-csv reader))]
      (doseq [[locale msgid msgstr] csv-data]
        (let [trimmed-msgstr (str/trim msgstr)
              trimmed-msgid (str/trim msgid)]
          (when-not (str/blank? trimmed-msgstr)
            (t2/with-transaction [_tx]
              (mdb.query/update-or-insert! :model/ContentTranslation
                                           {:locale locale :msgid trimmed-msgid}
                                           (constantly {:locale locale
                                                        :msgid trimmed-msgid
                                                        :msgstr trimmed-msgstr})))))))))

(api/defendpoint ^:multipart POST "/upload"
  "Upload a CSV of content translations"
  [:as {raw-params :params}]
  (do
    (import-translations! {:filename      (get-in raw-params ["file" :filename])
                           :file          (get-in raw-params ["file" :tempfile])})
    {:status 200
     :headers {"Content-Type" "application/json"}
     ; TODO: Add a better message describing what was changed
     :body (json/encode {:success true
                         :message "Import was successful"})}))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/"
  "Provides content translations"
  []
  {:data (ct/get-translations)})

(set! *warn-on-reflection* true)

(api/define-routes)
