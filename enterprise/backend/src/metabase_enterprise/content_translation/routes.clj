(ns metabase-enterprise.content-translation.routes
  "Endpoints relating to the translation of user-generated content"
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [metabase-enterprise.content-translation.dictionary :as dictionary]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.content-translation.models :as ct]
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

(api.macros/defendpoint :get "/csv"
  "Provides content translation dictionary in CSV"
  [_route-params
   _query-params
   _body]
  (let [translations (ct/get-translations)
        csv-data (cons ["Language" "String" "Translation"]
                       (map (fn [{:keys [locale msgid msgstr]}]
                              [locale msgid msgstr])
                            translations))]
    {:status 200
     :headers {"Content-Type" "text/csv; charset=utf-8"
               "Content-Disposition" "attachment; filename=\"metabase-content-translations.csv\""}
     :body (with-out-str
             (csv/write-csv *out* csv-data))}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/content-translation` routes."
  (api.macros/ns-handler *ns* +auth))
