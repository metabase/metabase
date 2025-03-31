(ns metabase-enterprise.content-translation.api.routes
  "Endpoints relating to the translation of user-generated content"
  (:require
   [metabase-enterprise.content-translation.api.dictionary :as dictionary]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]))

(def ^:private http-status-ok 200)
(def ^:private http-status-unprocessable 422)

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
  (try
    (dictionary/import-translations! {:filename (get-in multipart-params ["file" :filename])
                                      :file     (get-in multipart-params ["file" :tempfile])})
    {:status http-status-ok
     :headers {"Content-Type" "application/json"}
     :body (json/encode {:success true
                         :message (tru "Import was successful")})}
    (catch clojure.lang.ExceptionInfo e
      ; If the exception contains a list of validation errors, return them properly formatted
      (if-let [errors (get (ex-data e) :errors)]
        {:status (or (:status-code (ex-data e)) http-status-unprocessable)
         :headers {"Content-Type" "application/json"}
         :body (json/encode {:success false
                             :message (.getMessage e)
                             :errors errors})}
        ; For other types of exceptions, rethrow
        (throw e)))
    (catch Exception e
      ; For unexpected errors, return a 500 error
      {:status 500
       :headers {"Content-Type" "application/json"}
       :body (json/encode {:success false
                           :message (tru "An unexpected error occurred: {0}" (.getMessage e))})})))

(api.macros/defendpoint :get "/dictionary"
  "Provides content translations stored in the content_translations table"
  [_route-params query-params _body]
  (let [locale (:locale query-params)]
    (if locale
      {:data (dictionary/get-translations locale)}
      {:data (dictionary/get-translations)})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/content-translation` routes."
  (api.macros/ns-handler *ns* +auth))

(set! *warn-on-reflection* true)
