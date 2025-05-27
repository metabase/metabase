(ns metabase-enterprise.content-translation.routes
  "Endpoints relating to the translation of user-generated content"
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [metabase-enterprise.content-translation.dictionary :as dictionary]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private http-status-content-too-large 413)

;; The maximum size of a content translation dictionary is 1.5MiB
;; This should equal the maxContentDictionarySizeInMiB variable in the frontend
(def ^:private max-content-translation-dictionary-size (* 1.5 1024 1024))

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
  (let [file (get-in multipart-params ["file" :tempfile])]
    (when (> (get-in multipart-params ["file" :size]) max-content-translation-dictionary-size)
      (throw (ex-info (tru "The dictionary should be less than {0}MB." (/ max-content-translation-dictionary-size (* 1024 1024)))
                      {:status-code http-status-content-too-large})))
    (when-not (instance? java.io.File file)
      (throw (ex-info (tru "No file provided") {:status-code 400})))
    (with-open [rdr (io/reader file)]
      (let [[_header & rows] (csv/read-csv rdr)]
        (dictionary/import-translations! rows)))
    {:success true}))

(defn- format-csv-to-stream [os]
  (let [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))
        headers ["Language" "String" "Translation"]
        translations (ct/get-translations)]
    (try
      (csv/write-csv writer [headers])
      (doseq [{:keys [locale msgid msgstr]} translations]
        (csv/write-csv writer [[locale msgid msgstr]]))
      (.flush writer)
      (finally
        (.close writer)))))

(api.macros/defendpoint :get "/csv"
  "Provides content translation dictionary in CSV"
  [_route-params
   _query-params
   _body]
  (sr/streaming-response {:content-type "text/csv; charset=utf-8"
                          :status 200
                          :headers {"Content-Disposition" "attachment; filename=\"metabase-content-translation-dictionary.csv\""}}
                         [os canceled-chan]
    (format-csv-to-stream os)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/content-translation` routes."
  (api.macros/ns-handler *ns* +auth))
