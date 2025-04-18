(ns metabase-enterprise.content-translation.api.routes
  "Endpoints relating to the translation of user-generated content"
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.content-translation.models :as ct]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.db.query :as mdb.query]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (org.apache.tika Tika)))

(def ^:private http-status-ok 200)
(def ^:private http-status-unprocessable 422)
(def ^:private http-status-unsupported-media-type 415)

(def ^:private ^Tika tika (Tika.))

(def ^:private allowed-extensions #{nil "csv"})

(def ^:private allowed-mime-types #{"text/csv"})

(def ^:private max-string-length 255)

(defn- file-extension [filename]
  (when filename
    (-> filename (str/split #"\.") rest last)))

(defn- file-mime-type [^File file]
  (.detect tika file))

(defn- check-filetype [filename file]
  (let [extension (file-extension filename)]
    (when-not (contains? allowed-extensions extension)
      (throw (ex-info (tru "The file could not be uploaded. Please upload a file with extension .csv or .txt")
                      {:status-code    http-status-unsupported-media-type
                       :file-extension extension})))
    ;; This might be expensive to compute, hence having this as a second case.
    (let [mime-type (file-mime-type file)]
      (when-not (contains? allowed-mime-types mime-type)
        (throw (ex-info (tru "The file could not be uploaded. Please upload a file in CSV format or plain text format")
                        {:status-code    http-status-unsupported-media-type
                         :file-extension extension
                         :mime-type      mime-type}))))))

(defn- check-valid-locale
  "Check if a locale is a valid supported locale according to our list of locales."
  [locale]
  (when-not (str/blank? locale)
    (when-not (i18n/available-locale? locale)
      (throw (ex-info (tru "Invalid locale: {0}" locale)
                      {:status-code http-status-unprocessable
                       :locale      locale})))))

(defn- check-string-length
  "Check if a string is within the maximum allowed length."
  [string-type string-value]
  (when (and (not (str/blank? string-value))
             (> (count string-value) max-string-length))
    (throw (ex-info (tru "{0} is longer than {1} characters, which is the maximum allowed length" string-type max-string-length)
                    {:status-code http-status-unprocessable
                     :string-type string-type
                     :length (count string-value)
                     :max-length max-string-length}))))

(defn import-translations!
  "Import translations from CSV and insert or update rows in the content_translation table."
  [{:keys [filename file]}]
  (with-open [reader (io/reader file)]
    (check-filetype filename file)
    (let [csv-data (rest (csv/read-csv reader))]
      ; Validate all the rows in the CSV
      (doseq [[row-index [locale msgid msgstr]] (map-indexed vector csv-data)]
        (let [trimmed-msgid (str/trim msgid)
              trimmed-msgstr (str/trim msgstr)]
          (try
            (check-valid-locale locale)
            (check-string-length "msgid" trimmed-msgid)
            (check-string-length "msgstr" trimmed-msgstr)
            (catch Exception e
              (throw (ex-info (str "The file could not be uploaded due to a problem in row " (+ row-index 2) ": " (.getMessage e)) {:error e :row-index (inc row-index)}))))))
      ; Update rows or insert new rows into the content translation table
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
  "/upload-dictionary"
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
  {:status http-status-ok
   :headers {"Content-Type" "application/json"}
   :body (json/encode {:success true
                       :message "Import was successful"})})

(api.macros/defendpoint :get "/dictionary"
  "Provides content translations stored in the content_translations table"
  [_route-params query-params _body]
  (let [locale (:locale query-params)]
    (if locale
      {:data (ct/get-translations locale)}
      {:data (ct/get-translations)})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/content-translation` routes."
  (api.macros/ns-handler *ns* +auth))

(set! *warn-on-reflection* true)
