(ns metabase-enterprise.content-translation.routes
  "Endpoints relating to the translation of user-generated content"
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [metabase-enterprise.content-translation.dictionary :as dictionary]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(def ^:private http-status-content-too-large 413)

;; The maximum size of a content translation dictionary is 1.5MiB
;; This should equal the maxContentDictionarySizeInMiB variable in the frontend
(def ^:private max-content-translation-dictionary-size (* 1.5 1024 1024))

(defn- check-file-size
  "Throws an error message if the file is too large. Note that frontend will also refuse to upload a file that's too large."
  [^File file]
  (let [file-size (.length file)]
    (when (> file-size max-content-translation-dictionary-size)
      (throw (ex-info (tru "Upload a dictionary smaller than {0}MB." (/ max-content-translation-dictionary-size (* 1024 1024)))
                      {:status-code http-status-content-too-large
                       :file-size file-size
                       :max-size max-content-translation-dictionary-size})))))

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
    (when-not (instance? java.io.File file)
      (throw (ex-info (tru "No file provided") {:status-code 400})))
    (check-file-size file)
    (with-open [rdr (io/reader file)]
      (let [[_header & rows] (csv/read-csv rdr)]
        (dictionary/import-translations! rows))))
  {:success true})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/content-translation` routes."
  (api.macros/ns-handler *ns* +auth))
