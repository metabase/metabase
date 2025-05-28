(ns metabase-enterprise.content-translation.api.routes
  "Endpoints relating to the translation of user-generated content"
  (:require
   [clojure.data.csv :as csv]
   [metabase-enterprise.content-translation.api.dictionary :as dictionary]
   [metabase-enterprise.content-translation.models :as ct]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.server.streaming-response :as sr]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms])
  (:import
   [java.io BufferedWriter OutputStreamWriter]
   [java.nio.charset StandardCharsets]))

(def ^:private http-status-ok 200)

(set! *warn-on-reflection* true)

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
  (dictionary/import-translations! {:filename (get-in multipart-params ["file" :filename])
                                    :file     (get-in multipart-params ["file" :tempfile])})
  {:status http-status-ok
   :headers {"Content-Type" "application/json"}
   :body (json/encode {:success true})})

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
