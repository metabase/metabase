(ns metabase-enterprise.data-studio.api.seed
  "`/api/ee/data-studio/seed` endpoints. Seeds come from two places: git-authored
  `seeds/<name>.csv` files materialized on pull (read-only here), and CSVs uploaded in the app
  (created/edited here). The `origin` field says which; only upload-origin seeds can be mutated."
  (:require
   [metabase-enterprise.data-studio.seeds :as seeds]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.upload.core :as upload]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private SeedRow
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:origin :string]
   [:table_id [:maybe ms/PositiveInt]]
   [:collection_id [:maybe ms/PositiveInt]]
   [:csv_hash [:maybe :string]]
   [:target_db_id [:maybe ms/PositiveInt]]
   [:database_name {:optional true} [:maybe :string]]
   [:schema_name [:maybe :string]]
   [:last_synced_sha [:maybe :string]]
   [:sync_error [:maybe :string]]])

(api.macros/defendpoint :get "/" :- [:sequential SeedRow]
  "List all seeds (git-synced and uploaded)."
  []
  (api/check-data-analyst)
  (seeds/list-seeds))

(api.macros/defendpoint :post "/" :- SeedRow
  "Upload a CSV as a new seed, materialized as a stable table in the chosen database/schema and
  published into the Library. `database_id`/`schema` are optional; omit to use the uploads database."
  ;; Ring counts every multipart part, so allow for the four this endpoint sends
  ;; (name, file, database_id, schema) rather than the shared file+one-field default.
  {:multipart {:max-file-size  upload/max-upload-size-bytes
               :max-file-count 4}}
  [_route-params
   _query-params
   _body
   {:keys [multipart-params]}
   :- [:map
       [:multipart-params
        [:map
         ["name" :string]
         ["file" [:map
                  [:filename :string]
                  [:tempfile (ms/InstanceOfClass java.io.File)]]]
         ["database_id" {:optional true} :string]
         ["schema" {:optional true} :string]]]]]
  (api/check-data-analyst)
  (let [file (get multipart-params "file")]
    (seeds/create-seed! {:seed-name (get multipart-params "name")
                         :filename  (:filename file)
                         :file      (:tempfile file)
                         :db-id     (some-> (get multipart-params "database_id") not-empty parse-long)
                         :schema    (get multipart-params "schema")})))

(api.macros/defendpoint :post ["/:id/csv" :id #"[0-9]+"] :- SeedRow
  "Replace an uploaded seed's CSV: full-refresh its materialized table from the new file."
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

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete an uploaded seed and drop its materialized table."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-data-analyst)
  (seeds/delete-seed! id)
  nil)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-studio/seed` routes."
  (api.macros/ns-handler *ns* +auth))
