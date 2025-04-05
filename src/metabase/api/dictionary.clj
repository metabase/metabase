(ns metabase.api.dictionary
  "Endpoints relating to the translation of user-generated content"
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.macros :as api.macros]
   [metabase.db.query :as mdb.query]
   [metabase.models.content-translation :as ct]
   [metabase.server.streaming-response :as sr]
   [metabase.util.date-2 :as u.date]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io BufferedWriter OutputStreamWriter)
   (java.nio.charset StandardCharsets)))

(defn- format-csv-to-stream [os display-names locales]
  (let [; If no locales were provided, we'll write all the rows out once with an empty locale
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

(api.macros/defendpoint :post "/csv"
  "Provides content translation dictionary in CSV"
  [_route-params
   _query-params
   {:keys [locales] :as _body} :- [:map
                                   [:locales ms/NonBlankString]]]
  (let [locales-list (str/split locales #"-")]
    (sr/streaming-response {:content-type "text/csv; charset=utf-8"
                            :status 200
                            :headers {"Content-Disposition" (format "attachment; filename=\"content_dictionary_%s.csv\""
                                                                    (u.date/format (t/zoned-date-time)))}}
                           [os canceled-chan]
      (format-csv-to-stream os (ct/get-all-display-names) locales-list))))

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

(api.macros/defendpoint :post
  "/upload"
  "Upload a CSV of content translations"
  {:multipart true}
  [_route_params
   _query-params
   _body
   {:keys [multipart-params], :as _request} :- [:map
                                                [:multipart-params
                                                 [:map
                                                  ["file"
                                                   [:map
                                                    [:filename :string]
                                                    [:tempfile (ms/InstanceOfClass java.io.File)]]]]]]]
  (import-translations! {:filename      (get-in multipart-params ["file" :filename])
                         :file          (get-in multipart-params ["file" :tempfile])})
  (do
    {:status 200
     :headers {"Content-Type" "application/json"}
     ; TODO: Describe exactly what was changed
     :body (json/encode {:success true
                         :message "Import was successful"})}))

#_{:clj-kondo/ignore [:deprecated-var]}
(api.macros/defendpoint :get "/"
  "Provides content translations stored in the content_translations table"
  []
  {:data (ct/get-translations)})

(set! *warn-on-reflection* true)
