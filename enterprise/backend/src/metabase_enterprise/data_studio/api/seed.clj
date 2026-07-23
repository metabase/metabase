(ns metabase-enterprise.data-studio.api.seed
  "`/api/ee/data-studio/seed` endpoints: manage seeds (curated CSVs materialized as stable tables)."
  (:require
   [metabase-enterprise.data-studio.seeds :as seeds]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.upload.core :as upload]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "List all seeds (CSV payload excluded)."
  []
  (api/check-data-analyst)
  (seeds/list-seeds))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a seed: store the CSV and materialize it as a plain, stably-named table published into the Library."
  {:multipart {:max-file-size  upload/max-upload-size-bytes
               :max-file-count upload/max-upload-part-count}}
  [_route-params
   _query-params
   _body
   {:keys [multipart-params]}
   :- [:map
       [:multipart-params
        [:map {:closed true}
         ["name" :string]
         ["file" [:map
                  [:filename :string]
                  [:tempfile (ms/InstanceOfClass java.io.File)]]]]]]]
  (api/check-data-analyst)
  (let [file (get multipart-params "file")]
    (seeds/create-seed! {:seed-name (get multipart-params "name")
                         :filename  (:filename file)
                         :file      (:tempfile file)})))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/csv"
  "Replace a seed's CSV: full-refresh the materialized table from the new file."
  {:multipart {:max-file-size  upload/max-upload-size-bytes
               :max-file-count upload/max-upload-part-count}}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body
   {:keys [multipart-params]}
   :- [:map
       [:multipart-params
        [:map {:closed true}
         ["file" [:map
                  [:filename :string]
                  [:tempfile (ms/InstanceOfClass java.io.File)]]]]]]]
  (api/check-data-analyst)
  (let [file (get multipart-params "file")]
    (seeds/replace-seed! id (:filename file) (:tempfile file))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a seed and drop its materialized table."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-data-analyst)
  (seeds/delete-seed! id)
  api/generic-204-no-content)

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/csv"
  "Download a seed's stored CSV."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-data-analyst)
  (let [{:keys [name csv]} (seeds/seed-csv id)]
    {:status  200
     :headers {"Content-Type"        "text/csv"
               "Content-Disposition" (format "attachment; filename=\"%s.csv\"" name)}
     :body    csv}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-studio/seed` routes."
  (api.macros/ns-handler *ns* +auth))
