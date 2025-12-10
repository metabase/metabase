(ns metabase.upload.api
  (:require
   [clojure.java.io :as io]
   [metabase.api.macros :as api.macros]
   [metabase.upload.impl :as upload]
   [metabase.upload.settings :as upload.settings]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(defn- from-csv!
  "This helper function exists to make testing the POST /api/upload/csv endpoint easier."
  [{:keys [collection-id filename file]}]
  (try
    (let [uploads-db-settings (upload.settings/uploads-settings)
          model (upload/create-csv-upload! {:collection-id collection-id
                                            :filename      filename
                                            :file          file
                                            :schema-name   (:schema_name uploads-db-settings)
                                            :table-prefix  (:table_prefix uploads-db-settings)
                                            :db-id         (or (:db_id uploads-db-settings)
                                                               (throw (ex-info (tru "The uploads database is not configured.")
                                                                               {:status-code 422})))})]
      {:status  200
       :body    (:id model)
       :headers {"metabase-table-id" (str (:table-id model))}})
    (catch Throwable e
      {:status (or (-> e ex-data :status-code)
                   500)
       :body   {:message (or (ex-message e)
                             (tru "There was an error uploading the file"))}})
    (finally (io/delete-file file :silently))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/csv"
  "Create a table and model populated with the values from the attached CSV. Returns the model ID if successful."
  {:multipart true}
  ;; TODO -- not clear collection_id and file are supposed to come from `:multipart-params`
  [_route-params
   _query-params
   _body
   {{collection-id "collection_id", file "file"} :multipart-params, :as _request}
   :- [:map
       [:multipart-params
        [:map
         ["collection_id" [:maybe
                           {:decode/api (fn [collection-id]
                                          (when-not (= collection-id "root")
                                            collection-id))}
                           pos-int?]]
         ["file" [:map
                  [:filename :string]
                  [:tempfile (ms/InstanceOfClass java.io.File)]]]]]]]
  ;; parse-long returns nil with "root" as the collection ID, which is what we want anyway
  (from-csv! {:collection-id collection-id
              :filename      (:filename file)
              :file          (:tempfile file)}))
