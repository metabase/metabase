(ns metabase-enterprise.data-studio.api.table
  "/api/ee/data-studio/table endpoints for bulk table operations."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.core :as collections]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.core :as queries]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(mr/def ::table-selectors
  [:map
   ;; disjunctive filters (e.g. db_id IN $database_ids OR id IN $table_ids)
   [:database_ids {:optional true} [:sequential ms/PositiveInt]]
   [:schema_ids {:optional true} [:sequential :string]]
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

(mr/def ::data-layers
  (into [:enum {:decode/string keyword}] table/data-layers))

(mr/def ::data-sources
  (into [:enum {:decode/string keyword}] table/data-sources))

(mr/def ::data-authorities
  (into [:enum {:decode/string keyword}] table/writable-data-authority-types))

(defn- sync-unhidden-tables
  "Function to call on newly unhidden tables. Starts a thread to sync all tables. Groups tables by database to
  efficiently sync tables from different databases."
  [newly-unhidden]
  (when (seq newly-unhidden)
    (u.jvm/in-virtual-thread*
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

(defn- maybe-sync-unhidden-tables!
  [existing-tables {:keys [data_layer] :as body}]
  ;; sync any tables that are changed from copper to something else
  (sync-unhidden-tables (when (and (contains? body :data_layer) (not= :copper data_layer))
                          (filter #(= :copper (:data_layer %)) existing-tables))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/edit"
  "Bulk updating tables."
  [_route-params
   _query-params
   body
   :- [:merge
       ::table-selectors
       [:map {:closed true}
        [:data_authority {:optional true} [:maybe ::data-authorities]]
        [:data_source {:optional true} [:maybe ::data-sources]]
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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

(defn- sync-schema-async!
  [table user-id]
  (events/publish-event! :event/table-manual-sync {:object table :user-id user-id})
  (quick-task/submit-task! #(database-routing/with-database-routing-off (sync/sync-table! table))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/sync-schema"
  "Batch version of /table/:id/sync_schema. Takes an abstract table selection as /table/edit does.
  - Currently checks policy before returning (so you might receive a 4xx on e.g. AuthZ policy failure)
  - The sync itself is however, asyncronous. This call may return before all tables synced."
  [_
   _
   body :- ::table-selectors]
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-studio/table` routes."
  (api.macros/ns-handler *ns* +auth))
