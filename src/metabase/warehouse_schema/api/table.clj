(ns metabase.warehouse-schema.api.table
  "/api/table endpoints."
  (:require
   [clojure.java.io :as io]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver.h2 :as h2]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [metabase.upload.core :as upload]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.table :as schema.table]
   [metabase.xrays.core :as xrays]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private TableVisibilityType
  "Schema for a valid table visibility type."
  (into [:enum] (map name table/visibility-types)))

(def ^:private FieldOrder
  "Schema for a valid table field ordering."
  (into [:enum] (map name table/field-orderings)))

(api.macros/defendpoint :get "/"
  "Get all `Tables`."
  []
  (as-> (t2/select :model/Table, :active true, {:order-by [[:name :asc]]}) tables
    (t2/hydrate tables :db)
    (into [] (comp (filter mi/can-read?)
                   (map schema.table/present-table))
          tables)))

(api.macros/defendpoint :get "/:id"
  "Get `Table` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [include_editable_data_model]}
   :- [:map
       [:include_editable_data_model {:optional true} [:maybe :boolean]]]]
  (let [api-perm-check-fn (if include_editable_data_model
                            api/write-check
                            api/read-check)]
    (-> (api-perm-check-fn :model/Table id)
        (t2/hydrate :db :pk_field)
        schema.table/present-table)))

(api.macros/defendpoint :get "/:table-id/data"
  "Get the data for the given table"
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]]
  (let [table (t2/select-one :model/Table :id table-id)
        db-id (:db_id table)]
    (api/read-check table)
    (qp.store/with-metadata-provider db-id
      (let [mp       (qp.store/metadata-provider)
            query    (-> (lib/query mp (lib.metadata/table mp table-id))
                         (update-in [:middleware :js-int-to-string?] (fnil identity true))
                         qp/userland-query-with-default-constraints
                         (update :info merge {:executed-by api/*current-user-id*
                                              :context     :table-grid
                                              :card-id     nil}))]
        (events/publish-event! :event/table-read {:object  table
                                                  :user-id api/*current-user-id*})
        (span/with-span!
          {:name "query-table-async"}
          (qp.streaming/streaming-response [rff :api]
            (qp/process-query query
             ;; For now, doing this transformation here makes it easy to iterate on our payload shape.
             ;; In the future, we might want to implement a new export-type, say `:api/table`, instead.
             ;; Then we can avoid building non-relevant fields, only to throw them away again.
                              (qp.streaming/transforming-query-response
                               rff
                               (fn [response]
                                 (dissoc response :json_query :context :cached :average_execution_time))))))))))

(mu/defn ^:private update-table!*
  "Takes an existing table and the changes, updates in the database and optionally calls `table/update-field-positions!`
  if field positions have changed."
  [{:keys [id] :as existing-table} :- [:map [:id ::lib.schema.id/table]]
   body]
  (when-let [changes (not-empty (u/select-keys-when body
                                                    :non-nil [:display_name :show_in_getting_started :entity_type :field_order]
                                                    :present [:description :caveats :points_of_interest :visibility_type]))]
    (api/check-500 (pos? (t2/update! :model/Table id changes))))
  (let [updated-table        (t2/select-one :model/Table :id id)
        changed-field-order? (not= (:field_order updated-table) (:field_order existing-table))]
    (if changed-field-order?
      (do
        (table/update-field-positions! updated-table)
        (t2/hydrate updated-table [:fields [:target :has_field_values] :dimensions :has_field_values]))
      updated-table)))

;; TODO -- this seems like it belongs in the `sync` module... right?
(defn- sync-unhidden-tables
  "Function to call on newly unhidden tables. Starts a thread to sync all tables."
  [newly-unhidden]
  (when (seq newly-unhidden)
    (quick-task/submit-task!
     (fn []
       (let [database (table/database (first newly-unhidden))]
         ;; it's okay to allow testing H2 connections during sync. We only want to disallow you from testing them for the
         ;; purposes of creating a new H2 database.
         (if (binding [h2/*allow-testing-h2-connections* true]
               (driver.u/can-connect-with-details? (:engine database) (:details database)))
           (doseq [table newly-unhidden]
             (log/info (u/format-color :green "Table '%s' is now visible. Resyncing." (:name table)))
             (sync/sync-table! table))
           (log/warn (u/format-color :red "Cannot connect to database '%s' in order to sync unhidden tables"
                                     (:name database)))))))))

(defn- update-tables!
  [ids {:keys [visibility_type] :as body}]
  (let [existing-tables (t2/select :model/Table :id [:in ids])]
    (api/check-404 (= (count existing-tables) (count ids)))
    (run! api/write-check existing-tables)
    (let [updated-tables (t2/with-transaction [_conn] (mapv #(update-table!* % body) existing-tables))
          newly-unhidden (when (and (contains? body :visibility_type) (nil? visibility_type))
                           (into [] (filter (comp some? :visibility_type)) existing-tables))]
      (sync-unhidden-tables newly-unhidden)
      updated-tables)))

(api.macros/defendpoint :put "/:id"
  "Update `Table` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:display_name            {:optional true} [:maybe ms/NonBlankString]]
            [:entity_type             {:optional true} [:maybe ms/EntityTypeKeywordOrString]]
            [:visibility_type         {:optional true} [:maybe TableVisibilityType]]
            [:description             {:optional true} [:maybe :string]]
            [:caveats                 {:optional true} [:maybe :string]]
            [:points_of_interest      {:optional true} [:maybe :string]]
            [:show_in_getting_started {:optional true} [:maybe :boolean]]
            [:field_order             {:optional true} [:maybe FieldOrder]]]]
  (first (update-tables! [id] body)))

(api.macros/defendpoint :put "/"
  "Update all `Table` in `ids`."
  [_route-params
   _query-params
   {:keys [ids], :as body} :- [:map
                               [:ids                     [:sequential ms/PositiveInt]]
                               [:display_name            {:optional true} [:maybe ms/NonBlankString]]
                               [:entity_type             {:optional true} [:maybe ms/EntityTypeKeywordOrString]]
                               [:visibility_type         {:optional true} [:maybe TableVisibilityType]]
                               [:description             {:optional true} [:maybe :string]]
                               [:caveats                 {:optional true} [:maybe :string]]
                               [:points_of_interest      {:optional true} [:maybe :string]]
                               [:show_in_getting_started {:optional true} [:maybe :boolean]]]]
  (update-tables! ids body))

(api.macros/defendpoint :get "/:id/query_metadata"
  "Get metadata about a `Table` useful for running queries.
   Returns DB, fields, field FKs, and field values.

   Passing `include_hidden_fields=true` will include any hidden `Fields` in the response. Defaults to `false`
   Passing `include_sensitive_fields=true` will include any sensitive `Fields` in the response. Defaults to `false`.

   Passing `include_editable_data_model=true` will check that the current user has write permissions for the table's
   data model, while `false` checks that they have data access perms for the table. Defaults to `false`.

   These options are provided for use in the Admin Edit Metadata page."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [include_sensitive_fields include_hidden_fields include_editable_data_model]}
   :- [:map
       [:include_sensitive_fields    {:default false} [:maybe ms/BooleanValue]]
       [:include_hidden_fields       {:default false} [:maybe ms/BooleanValue]]
       [:include_editable_data_model {:default false} [:maybe ms/BooleanValue]]]]
  (schema.table/fetch-table-query-metadata id {:include-sensitive-fields?    include_sensitive_fields
                                               :include-hidden-fields?       include_hidden_fields
                                               :include-editable-data-model? include_editable_data_model}))

(api.macros/defendpoint :get "/card__:id/query_metadata"
  "Return metadata for the 'virtual' table for a Card."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (first (schema.table/batch-fetch-card-query-metadatas [id])))

(api.macros/defendpoint :get "/card__:id/fks"
  "Return FK info for the 'virtual' table for a Card. This is always empty, so this endpoint
   serves mainly as a placeholder to avoid having to change anything on the frontend."
  [_route-params :- [:map
                     [:id ms/PositiveInt]]]
  []) ; return empty array

(api.macros/defendpoint :get "/:id/fks"
  "Get all foreign keys whose destination is a `Field` that belongs to this `Table`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/read-check :model/Table id)
  (when-let [field-ids (seq (t2/select-pks-set :model/Field, :table_id id, :visibility_type [:not= "retired"], :active true))]
    (for [origin-field (t2/select :model/Field, :fk_target_field_id [:in field-ids], :active true)]
      ;; it's silly to be hydrating some of these tables/dbs
      {:relationship   :Mt1
       :origin_id      (:id origin-field)
       :origin         (-> (t2/hydrate origin-field [:table :db])
                           (update :table schema.table/present-table))
       :destination_id (:fk_target_field_id origin-field)
       :destination    (t2/hydrate (t2/select-one :model/Field :id (:fk_target_field_id origin-field)) :table)})))

(api.macros/defendpoint :post "/:id/rescan_values"
  "Manually trigger an update for the FieldValues for the Fields belonging to this Table. Only applies to Fields that
   are eligible for FieldValues."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [table (api/write-check (t2/select-one :model/Table :id id))]
    (events/publish-event! :event/table-manual-scan {:object table :user-id api/*current-user-id*})
    ;; Grant full permissions so that permission checks pass during sync. If a user has DB detail perms
    ;; but no data perms, they should stll be able to trigger a sync of field values. This is fine because we don't
    ;; return any actual field values from this API. (#21764)
    (request/as-admin
      ;; async so as not to block the UI
      (quick-task/submit-task!
       (fn []
         (sync/update-field-values-for-table! table))))
    {:status :success}))

(api.macros/defendpoint :post "/:id/discard_values"
  "Discard the FieldValues belonging to the Fields in this Table. Only applies to fields that have FieldValues. If
   this Table's Database is set up to automatically sync FieldValues, they will be recreated during the next cycle."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/write-check (t2/select-one :model/Table :id id))
  (when-let [field-ids (t2/select-pks-set :model/Field :table_id id)]
    (t2/delete! (t2/table-name :model/FieldValues) :field_id [:in field-ids]))
  {:status :success})

(api.macros/defendpoint :get "/:id/related"
  "Return related entities."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (-> (t2/select-one :model/Table :id id) api/read-check xrays/related))

(api.macros/defendpoint :put "/:id/fields/order" :- [:map
                                                     [:success [:= true]]]
  "Reorder fields"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   field-order :- [:sequential ms/PositiveInt]]
  (-> (t2/select-one :model/Table :id id) api/write-check (table/custom-order-fields! field-order))
  {:success true})

(mu/defn- update-csv!
  "This helper function exists to make testing the POST /api/table/:id/{action}-csv endpoints easier."
  [options :- [:map
               [:table-id ms/PositiveInt]
               [:filename :string]
               [:file (ms/InstanceOfClass java.io.File)]
               [:action upload/update-action-schema]]]
  (try
    (let [_result (upload/update-csv! options)]
      {:status 200
       ;; There is scope to return something more interesting.
       :body   nil})
    (catch Throwable e
      {:status (or (-> e ex-data :status-code)
                   500)
       :body   {:message (or (ex-message e)
                             (tru "There was an error uploading the file"))}})
    (finally (io/delete-file (:file options) :silently))))

(api.macros/defendpoint :post "/:id/append-csv"
  "Inserts the rows of an uploaded CSV file into the table identified by `:id`. The table must have been created by
  uploading a CSV file."
  {:multipart true}
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   _body
   {:keys [multipart-params], :as _request} :- [:map
                                                [:multipart-params
                                                 [:map
                                                  ["file"
                                                   [:map
                                                    [:filename :string]
                                                    [:tempfile (ms/InstanceOfClass java.io.File)]]]]]]]
  (update-csv! {:table-id id
                :filename (get-in multipart-params ["file" :filename])
                :file     (get-in multipart-params ["file" :tempfile])
                :action   :metabase.upload/append}))

(api.macros/defendpoint :post "/:id/replace-csv"
  "Replaces the contents of the table identified by `:id` with the rows of an uploaded CSV file. The table must have
  been created by uploading a CSV file."
  {:multipart true}
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   _body
   {:keys [multipart-params], :as _request} :- [:map
                                                [:multipart-params
                                                 [:map
                                                  ["file"
                                                   [:map
                                                    [:filename :string]
                                                    [:tempfile (ms/InstanceOfClass java.io.File)]]]]]]]
  (update-csv! {:table-id id
                :filename (get-in multipart-params ["file" :filename])
                :file     (get-in multipart-params ["file" :tempfile])
                :action   :metabase.upload/replace}))
