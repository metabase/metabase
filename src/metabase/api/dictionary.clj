(ns metabase.api.dictionary
  "Endpoints relating to the translation of user-generated content"
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [compojure.core :refer [GET]]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.db.query :as mdb.query]
   [metabase.models.content-translation :as ct]
   [metabase.server.streaming-response :as sr]
   [metabase.util.date-2 :as u.date]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.io BufferedWriter OutputStreamWriter)
   (java.nio.charset StandardCharsets)))


(defn- format-csv-to-stream [os display-names locales]
  (let [
        ; If no locales were provided, we'll write all the rows out once with an empty locale
        locales (if (empty? locales) [""] locales)
        writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))
        headers ["Language" "String" "Translation"]]
    (try
      (csv/write-csv writer [headers])
      (doseq [locale locales]
        (doseq [display-name display-names]
          (csv/write-csv writer [[locale display-name ""]])))
      (.flush writer)
      (finally
        (.close writer)))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/csv/:locales-string"
  "Provides downloadable content translation dictionary in csv. Example URL: /csv/es-fr"
  [locales-string]
  (let [locales (str/split locales-string #"-")]
    (sr/streaming-response {
                            :content-type "text/csv; charset=utf-8"
                            :status 200
                            :headers {"Content-Disposition" (format "attachment; filename=\"content_dictionary_%s.csv\""
                                                                    (u.date/format (t/zoned-date-time)))}
                            } [os canceled-chan]
                           (format-csv-to-stream os (ct/get-all-display-names) locales))))

(defn import-translations!
  "Import translations from CSV and insert or update rows in the content_translation table."
  ; TODO: Let the user specify the table should be truncated before new translations are inserted
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

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint ^:multipart POST "/upload"
  "Upload a CSV of content translations"
  [:as {raw-params :params}]
  (do
    (import-translations! {:filename      (get-in raw-params ["file" :filename])
                           :file          (get-in raw-params ["file" :tempfile])})
    {:status 200
     :headers {"Content-Type" "application/json"}
     ; TODO: Describe exactly what was changed
     :body (json/encode {:success true
                         :message "Import was successful"})}))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/"
  "Provides content translations stored in the content_translations table"
  []
  {:data (ct/get-translations)})

(set! *warn-on-reflection* true)

(api/define-routes)
