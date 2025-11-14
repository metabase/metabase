(ns metabase.warehouse-schema.api.table
  "/api/table endpoints."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as app-db]
   [metabase.collections.core :as collections]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.queries.core :as queries]
   [metabase.query-processor :as qp]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [metabase.upload.core :as upload]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.table :as schema.table]
   [metabase.warehouses.api :as warehouses]
   [metabase.xrays.core :as xrays]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(def ^:private TableVisibilityType
  "Schema for a valid table visibility type."
  (into [:enum] (map name table/visibility-types)))

(def ^:private FieldOrder
  "Schema for a valid table field ordering."
  (into [:enum] (map name table/field-orderings)))

(mr/def ::data-authority-write
  "Schema for writing a valid table data authority."
  (into [:enum] (map name table/writable-data-authority-types)))

(mr/def ::data-authority-read
  "Schema for returning a table data authority type."
  (into [:enum] table/readable-data-authority-types))

(api.macros/defendpoint :get "/"
  "Get all `Tables`."
  [_
   {:keys [term visibility-type data-layer data-source owner-user-id owner-email orphan-only unused-only]}
   :- [:map
       ;; conjunctive search terms
       [:term {:optional true} :string]
       [:visibility-type {:optional true} :string]
       [:data-layer {:optional true} :string]
       [:data-source {:optional true} :string]
       [:owner-user-id {:optional true} [:maybe :int]]
       [:owner-email {:optional true} :string]
       [:orphan-only {:optional true} [:maybe ms/BooleanValue]]
       [:unused-only {:optional true} [:maybe ms/BooleanValue]]]]
  (let [pattern    (some-> term (str/replace "*" "%") (cond-> (not (str/ends-with? term "%")) (str "%")))
        empty-null (fn [x] (if (and (string? x) (str/blank? x)) nil x))
        like       (case (app-db/db-type)
                     (:h2 :postgres) [:ilike :name pattern]
                     [:raw [:like :name pattern] " COLLATE " [:inline "utf8mb4_unicode_ci"]])
        where      (cond-> [:and [:= :active true]]
                     (not (str/blank? term)) (conj like)
                     visibility-type         (conj [:= :visibility_type (empty-null visibility-type)])
                     data-layer              (conj [:= :data_layer      (empty-null data-layer)])
                     data-source             (conj [:= :data_source     (empty-null data-source)])
                     owner-user-id           (conj [:= :owner_user_id   (empty-null owner-user-id)])
                     owner-email             (conj [:= :owner_email     (empty-null owner-email)])
                     orphan-only             (conj [:and [:= :owner_email nil] [:= :owner_user_id nil]]))
        ;; Use LEFT JOIN to efficiently filter orphaned tables
        ;; Exclude transforms as dependents since they produce tables
        query      (cond-> {:where    where
                            :order-by [[:name :asc]]}
                     (and unused-only (premium-features/has-feature? :dependencies))
                     (assoc :left-join [[:dependency :d]
                                        [:and
                                         [:= :d.to_entity_type "table"]
                                         [:= :d.to_entity_id :metabase_table.id]]]
                            :where     [:and where [:= :d.id nil]]))
        hydrations (cond-> [:db :published_as_model]
                     (premium-features/has-feature? :transforms)   (conj :transform))]
    (as-> (t2/select :model/Table query) tables
      (apply t2/hydrate tables hydrations)
      (into [] (comp (filter mi/can-read?)
                     (map schema.table/present-table))
            tables))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/:id"
  "Get `Table` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [include_editable_data_model]}
   :- [:map
       [:include_editable_data_model {:optional true} [:maybe :boolean]]]]
  ;; partial schema only
  :- [:map {:closed false}
      [:data_authority ::data-authority-read]]
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
  (when-let [changes (-> body
                         (u/select-keys-when
                          :non-nil [:display_name :show_in_getting_started :entity_type :field_order]
                          :present [:description :caveats :points_of_interest :visibility_type
                                    ;; bulk-metadata-editing
                                    :data_layer :data_authority :data_source :owner_email :owner_user_id])
                         (u/update-some :data_layer keyword)
                         (u/update-some :data_source keyword)
                         not-empty)]
    (t2/update! :model/Table id changes))
  (let [updated-table        (t2/select-one :model/Table :id id)
        changed-field-order? (not= (:field_order updated-table) (:field_order existing-table))]
    (if changed-field-order?
      (do
        (table/update-field-positions! updated-table)
        (t2/hydrate updated-table [:fields [:target :has_field_values] :dimensions :has_field_values]))
      updated-table)))

;; TODO (Cam 2015/01/16) this seems like it belongs in the `sync` module... right?
(defn- sync-unhidden-tables
  "Function to call on newly unhidden tables. Starts a thread to sync all tables. Groups tables by database to
  efficiently sync tables from different databases."
  [newly-unhidden]
  (when (seq newly-unhidden)
    (quick-task/submit-task!
     (fn []
       (doseq [[db-id tables] (group-by :db_id newly-unhidden)]
         (let [database (t2/select-one :model/Database db-id)]
           ;; it's okay to allow testing H2 connections during sync. We only want to disallow you from testing them for the
           ;; purposes of creating a new H2 database.
           (if (binding [driver.settings/*allow-testing-h2-connections* true]
                 (driver.u/can-connect-with-details? (:engine database) (:details database)))
             (doseq [table tables]
               (log/info (u/format-color :green "Table '%s' is now visible. Resyncing." (:name table)))
               (sync/sync-table! table))
             (log/warn (u/format-color :red "Cannot connect to database '%s' in order to sync unhidden tables"
                                       (:name database))))))))))

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
            [:field_order             {:optional true} [:maybe FieldOrder]]
            [:data_authority          {:optional true} [:maybe ::data-authority-write]]
            ;; bulk-metadata-editing
            [:data_source             {:optional true} [:maybe :string]]
            [:data_layer              {:optional true} [:maybe :string]]
            [:owner_email             {:optional true} [:maybe :string]]
            [:owner_user_id           {:optional true} [:maybe :int]]]]
  (first (update-tables! [id] body)))

(api.macros/defendpoint :put "/"
  "Update all `Table` in `ids`.

  Deprecated, should use PUT /table/edit from now on."
  [_route-params
   _query-params
   {:keys [ids], :as body} :- [:map
                               [:ids                                      [:sequential ms/PositiveInt]]
                               [:display_name            {:optional true} [:maybe ms/NonBlankString]]
                               [:entity_type             {:optional true} [:maybe ms/EntityTypeKeywordOrString]]
                               [:visibility_type         {:optional true} [:maybe TableVisibilityType]]
                               [:description             {:optional true} [:maybe :string]]
                               [:caveats                 {:optional true} [:maybe :string]]
                               [:points_of_interest      {:optional true} [:maybe :string]]
                               [:show_in_getting_started {:optional true} [:maybe :boolean]]
                               [:data_authority          {:optional true} [:maybe ::data-authority-write]]
                               ;; bulk-metadata-editing
                               [:data_source             {:optional true} [:maybe :string]]
                               [:data_layer              {:optional true} [:maybe :string]]
                               [:owner_email             {:optional true} [:maybe :string]]
                               [:owner_user_id           {:optional true} [:maybe :int]]]]
  (update-tables! ids body))

(mr/def ::table-selectors
  [:map
   ;; disjunctive filters (e.g. db_id IN $database_ids OR id IN $table_ids)
   [:database_ids {:optional true} [:sequential ms/PositiveInt]]
   [:schema_ids {:optional true} [:sequential :string]] ;todo find schema
   [:table_ids {:optional true} [:sequential ms/PositiveInt]]])

(mu/defn ^:private table-selectors->filter
  [{:keys [database_ids table_ids schema_ids]}]
  (let [schema-expr (fn [s]
                      (let [[schema-db-id schema-name] (str/split s #"\:")]
                        [:and [:= :db_id (parse-long schema-db-id)] [:= :schema schema-name]]))]
    (cond-> [:or false]
      (seq database_ids) (conj [:in :db_id (sort database_ids)])
      (seq table_ids)    (conj [:in :id    (sort table_ids)])
      (seq schema_ids)   (conj (into [:or] (map schema-expr) (sort schema_ids))))))

(mr/def ::data-layers (into [:enum {:decode/string keyword}] table/data-layers))

(defn- maybe-sync-unhidden-tables!
  [existing-tables {:keys [data_layer] :as body}]
  ;; sync any tables that are changed from copper to something else
  (sync-unhidden-tables (when (and (contains? body :data_layer) (not= :copper data_layer))
                          (filter #(= :copper (:data_layer %)) existing-tables))))

(api.macros/defendpoint :post "/edit"
  "Bulk updating tables."
  [_route-params
   _query-params
   body
   :- [:merge
       ::table-selectors
       [:map {:closed true}
        [:data_authority {:optional true} [:maybe :string]]
        [:data_source {:optional true} [:maybe :string]]
        [:data_layer {:optional true} [:maybe ::data-layers]]
        [:entity_type {:optional true} [:maybe :string]]
        [:owner_email {:optional true} [:maybe :string]]
        [:owner_user_id {:optional true} [:maybe :int]]]]]
  (api/check-superuser)
  (let [where           (table-selectors->filter (select-keys body [:database_ids :schema_ids :table_ids]))
        set-ks          [:data_authority
                         :data_source
                         :data_layer
                         :owner_email
                         :owner_user_id
                         :entity_type]
        existing-tables (t2/select :model/Table {:where where})
        table-ids       (set (map :id existing-tables))
        set-map         (select-keys body set-ks)]
    (when (seq set-map)
      (t2/update! :model/Table [:in table-ids] set-map)
      (maybe-sync-unhidden-tables! existing-tables set-map))
    {}))

(defn- table->published-model
  [{:keys [id name db_id] :as _table} creator-id collection-id]
  {:name                   (format "Model based on %s" name)
   :description            (format "Base model for table %s " name)
   :dataset_query          (let [mp (lib-be/application-database-metadata-provider db_id)]
                             (lib/query mp (lib.metadata/table mp id)))
   :type                   :model
   :display                :table
   :visualization_settings {}
   :creator_id             creator-id
   :collection_id          collection-id
   :published_table_id     id})

(api.macros/defendpoint :post "/publish-model"
  "Create a model for each of selected tables"
  [_route-params
   _query-params
   {:keys [target_collection_id]
    :as body}
   :- [:merge
       ::table-selectors
       [:map
        [:target_collection_id [:maybe [:or pos-int? [:= "library"]]]]]]]
  (api/check-superuser)
  (let [target-collection (cond
                            (= "library" target_collection_id) (api/check-403 (collections/remote-synced-collection))
                            (nil? target_collection_id) nil
                            :else (api/check-404 (t2/select-one :model/Collection target_collection_id)))
        where             (table-selectors->filter (select-keys body [:database_ids :schema_ids :table_ids]))
        created-models    (t2/with-transaction [_conn]
                            (into []
                                  (comp
                                   (map t2.realize/realize)
                                   (partition-all 20)
                                   (mapcat (fn [batch]
                                             (mapv (fn [table]
                                                     (queries/create-card! (table->published-model table api/*current-user-id* (:id target-collection)) @api/*current-user*))
                                                   batch))))
                                  (t2/reducible-select :model/Table :active true {:where where})))]
    {:created_count     (count created-models)
     :models            created-models
     :target_collection target-collection}))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-query-params-use-kebab-case]}
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

;; I think this endpoint can keep the `card__` part since it's a HACK to make IDs like `card__1` work
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(api.macros/defendpoint :get "/card__:id/query_metadata"
  "Return metadata for the 'virtual' table for a Card."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (first (schema.table/batch-fetch-card-query-metadatas [id] {:include-database? true})))

;; I think this endpoint can keep the `card__` part since it's a HACK to make IDs like `card__1` work
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
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

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
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

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
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

(defn- sync-schema-async!
  [table user-id]
  (events/publish-event! :event/table-manual-sync {:object table :user-id user-id})
  (quick-task/submit-task! #(database-routing/with-database-routing-off (sync/sync-table! table))))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(api.macros/defendpoint :post "/:id/sync_schema"
  "Trigger a manual update of the schema metadata for this `Table`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [table (api/write-check (t2/select-one :model/Table :id id))
        database (api/write-check (warehouses/get-database (:db_id table) {:exclude-uneditable-details? true}))]
    ;; it's okay to allow testing H2 connections during sync. We only want to disallow you from testing them for the
    ;; purposes of creating a new H2 database.
    (if-let [ex (try
                  (binding [driver.settings/*allow-testing-h2-connections* true]
                    (driver.u/can-connect-with-details? (:engine database) (:details database) :throw-exceptions))
                  nil
                  (catch Throwable e
                    (log/warn (u/format-color :red "Cannot connect to database '%s' in order to sync table '%s'"
                                              (:name database) (:name table)))
                    e))]
      (throw (ex-info (ex-message ex) {:status-code 422}))
      (do
        (sync-schema-async! table api/*current-user-id*)
        {:status :ok}))))

(api.macros/defendpoint :post "/sync-schema"
  "Batch version of /table/:id/sync_schema. Takes an abstract table selection as /table/edit does.
  - Currently checks policy before returning (so you might receive a 4xx on e.g. AuthZ policy failure)
  - The sync itself is however, asyncronous. This call may return before all tables synced."
  [_
   _
   body :- ::table-selectors]
  ;; todo this obviously will not do
  ;; a. can checks/events/sync be batched
  ;; b. sync is flakey
  ;; idea: flag dirty / ready for sync
  ;;       job comes along and actually performs sync
  ;;       promise is nothing is done apart from the dirty/queueing with the call (incl authz/event until batchy batchy)
  (api/check-superuser)
  (let [tables (t2/select :model/Table {:where (table-selectors->filter body), :order-by [[:id]]})
        db-ids (sort (set (map :db_id tables)))]
    (doseq [database (t2/select :model/Database :id [:in db-ids])]
      (try
        (binding [driver.settings/*allow-testing-h2-connections* true]
          (driver.u/can-connect-with-details? (:engine database) (:details database) :throw-exceptions))
        nil
        (catch Throwable e
          (log/warn (u/format-color :red "Cannot connect to database '%s' in order to sync tables" (:name database)))
          (throw (ex-info (ex-message e) {:status-code 422})))))
    (doseq [table tables]
      (sync-schema-async! table api/*current-user-id*))
    {:status :ok}))

(api.macros/defendpoint :post "/rescan-values"
  "Batch version of /table/:id/rescan_values. Takes an abstract table selection as /table/edit does."
  [_
   _
   body :- ::table-selectors]
  (api/check-superuser)
  (let [tables (t2/select :model/Table {:where (table-selectors->filter body), :order-by [[:id]]})]
    ;; same permission skip as the single-table api, see comment in /:id/rescan_values
    (doseq [table tables]
      (events/publish-event! :event/table-manual-scan {:object table :user-id api/*current-user-id*})
      (request/as-admin
        (quick-task/submit-task! #(sync/update-field-values-for-table! table))))
    {:status :ok}))

(api.macros/defendpoint :post "/discard-values"
  "Batch version of /table/:id/discard_values. Takes an abstract table selection as /table/edit does."
  [_
   _
   body :- ::table-selectors]
  (api/check-superuser)
  (let [tables (t2/select :model/Table {:where (table-selectors->filter body), :order-by [[:id]]})]
    (let [field-ids-to-delete-q {:select [:id]
                                 :from   [(t2/table-name :model/Field)]
                                 :where  [:in :table_id (map :id tables)]}]
      (t2/delete! (t2/table-name :model/FieldValues) :field_id [:in field-ids-to-delete-q]))
    {:status :ok}))
