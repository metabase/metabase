(ns metabase.data-studio.api.table
  "/api/data-studio/table endpoints for bulk table operations."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.data-studio.db :as data-studio.db]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.models.table-user-settings :as schema.table-user-settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(events/derive! :event/table-update :metabase/event)

(mr/def ::table-selectors
  [:map {:closed true}
   ;; disjunctive filters (e.g. db_id IN $database_ids OR id IN $table_ids)
   [:database_ids {:optional true} [:sequential ms/PositiveInt]]
   [:schema_ids {:optional true} [:sequential :string]]
   [:table_ids {:optional true} [:sequential ms/PositiveInt]]])

(mr/def ::data-layers
  (into [:enum {:decode/string keyword}] table/data-layers))

;;; ------------------------------------------------ Remapping Graph Traversal ------------------------------------------------

(defn- remapped-table-ids-for-tables
  "Find tables connected via FK remapping (Dimensions).
  `input-field` and `output-field` are field aliases (:source_field or :target_field).
  Returns table IDs from `output-field` that are connected to the Tables with `table-ids` via `input-field`."
  [input-field output-field table-ids]
  (if (empty? table-ids)
    #{}
    (into #{} (map :table_id)
          (data-studio.db/fk-remapped-table-ids-for-tables
           (keyword (name input-field) "table_id")
           (keyword (name output-field) "table_id")
           table-ids
           table-ids))))

(defn- remapped-table-ids-for-selectors
  "Find tables connected via FK remapping (Dimensions) to the Tables picked out by `selectors`.
  `input-field` and `output-field` are field aliases (:source_field or :target_field)."
  [input-field output-field selectors]
  (into #{} (map :table_id)
        (data-studio.db/fk-remapped-table-ids-for-selectors
         (keyword (name input-field) "table_id")
         (keyword (name output-field) "table_id")
         selectors)))

(defn- upstream-table-ids
  "Given a set of table IDs, find all tables that these tables depend on via FK remapping (Dimensions)."
  [table-ids]
  (remapped-table-ids-for-tables :source_field :target_field table-ids))

(defn- downstream-table-ids
  "Given a set of table IDs, find all tables that depend on these tables via FK remapping (Dimensions)."
  [table-ids]
  (remapped-table-ids-for-tables :target_field :source_field table-ids))

(defn- traverse-graph
  "Recursively traverse the remapping graph starting from initial-ids.
  Returns all reachable table IDs (including initial-ids)."
  [neighbors-fn initial-ids]
  (loop [visited initial-ids
         frontier initial-ids]
    (let [new-neighbors (set/difference (neighbors-fn frontier) visited)]
      (if (empty? new-neighbors)
        visited
        (recur (set/union visited new-neighbors)
               new-neighbors)))))

(defn- all-upstream-table-ids
  "Get all upstream table IDs recursively for tables picked out by `selectors`.
  The first hop uses a subquery to avoid materializing potentially millions of IDs;
  subsequent hops use IDs since remappings are rare."
  [selectors]
  (let [initial-ids (remapped-table-ids-for-selectors :source_field :target_field selectors)]
    (if (empty? initial-ids)
      #{}
      (traverse-graph upstream-table-ids initial-ids))))

(defn- all-downstream-table-ids
  "Get all downstream table IDs recursively for tables picked out by `selectors`.
  The first hop uses a subquery to avoid materializing potentially millions of IDs;
  subsequent hops use IDs since remappings are rare."
  [selectors]
  (let [initial-ids (remapped-table-ids-for-selectors :target_field :source_field selectors)]
    (if (empty? initial-ids)
      #{}
      (traverse-graph downstream-table-ids initial-ids))))

(mr/def ::data-sources
  (into [:enum {:decode/string keyword}] table/writable-data-sources))

(mr/def ::data-authorities
  (into [:enum {:decode/string keyword}] table/writable-data-authority-types))

;;; ------------------------------------------------ Response Schemas ------------------------------------------------

(mr/def ::bulk-table-info
  "Schema for table info in bulk operations. Matches frontend BulkTableInfo type."
  [:map
   [:id ms/PositiveInt]
   [:db_id ms/PositiveInt]
   [:name :string]
   [:display_name :string]
   [:schema [:maybe :string]]
   [:is_published :boolean]])

(mr/def ::bulk-table-selection-info
  "Schema for /selection endpoint response. Matches frontend BulkTableSelectionInfo type."
  [:map
   [:selected_table [:maybe ::bulk-table-info]]
   [:published_downstream_tables [:sequential ::bulk-table-info]]
   [:unpublished_upstream_tables [:sequential ::bulk-table-info]]])

(defn- writable-tables
  "`tables`, or a 403 unless the current user can change the metadata of every one of them."
  [tables]
  (let [tables (t2/hydrate tables :can_write)]
    (api/check-403 (every? mi/can-write? tables))
    tables))

(defn- maybe-sync-unhidden-tables!
  [existing-tables {:keys [data_layer] :as body}]
  ;; sync any tables that are changed from hidden to something else
  (sync/sync-tables-in-background! (when (and (contains? body :data_layer) (not= :hidden data_layer))
                                     (filter #(= :hidden (:data_layer %)) existing-tables))))

(api.macros/defendpoint :post "/edit" :- [:map {:closed true}]
  "Bulk updating tables."
  [_route-params
   _query-params
   body
   :- [:merge
       ::table-selectors
       [:map {:closed true}
        [:data_authority {:optional true} ::data-authorities]
        [:data_source {:optional true} [:maybe ::data-sources]]
        [:data_layer {:optional true} [:maybe ::data-layers]]
        [:entity_type {:optional true} [:maybe :string]]
        [:owner_email {:optional true} [:maybe :string]]
        [:owner_user_id {:optional true} [:maybe :int]]]]]
  (api/check-data-studio-access)
  (let [selectors       (select-keys body [:database_ids :schema_ids :table_ids])
        set-ks          [:data_authority
                         :data_source
                         :data_layer
                         :owner_email
                         :owner_user_id
                         :entity_type]
        existing-tables (writable-tables (data-studio.db/tables-matching-selectors selectors))
        table-ids       (set (map :id existing-tables))
        set-map         (select-keys body set-ks)]
    (when (seq set-map)
      (schema.table-user-settings/upsert-table-user-settings-for-tables! table-ids set-map)
      (maybe-sync-unhidden-tables! existing-tables set-map)
      nil)
    {}))

(api.macros/defendpoint :post "/selection" :- ::bulk-table-selection-info
  "Gets information about selected tables"
  [_route-params
   _query-params
   body :- ::table-selectors]
  (api/check-data-studio-access)
  (let [selectors         (select-keys body [:database_ids :schema_ids :table_ids])
        selected-tables   (data-studio.db/selection-columns-for-selectors selectors 2)
        selected-table    (when-not (next selected-tables)
                            (first selected-tables))
        upstream-ids      (all-upstream-table-ids selectors)
        downstream-ids    (all-downstream-table-ids selectors)
        upstream-tables   (when (seq upstream-ids)
                            (data-studio.db/selection-columns-for-tables upstream-ids))
        downstream-tables (when (seq downstream-ids)
                            (data-studio.db/selection-columns-for-tables downstream-ids))]
    {:selected_table              selected-table
     :published_downstream_tables (filterv :is_published downstream-tables)
     :unpublished_upstream_tables (filterv (complement :is_published) upstream-tables)}))

(defn- sync-schema-async!
  [table user-id]
  (events/publish-event! :event/table-manual-sync {:object table :user-id user-id})
  (quick-task/submit-task! #(database-routing/with-anonymous-router-access (sync/sync-table! table))))

(api.macros/defendpoint :post "/sync-schema" :- :nil
  "Batch version of /table/:id/sync_schema. Takes an abstract table selection as /table/edit does.
  - Currently checks policy before returning (so you might receive a 4xx on e.g. AuthZ policy failure)
  - The sync itself is however, asynchronous. This call may return before all tables synced."
  [_
   _
   body :- ::table-selectors]
  (api/check-data-studio-access)
  (let [tables (writable-tables (data-studio.db/tables-matching-selectors-in-id-order body))
        db-ids (sort (set (map :db_id tables)))]
    (doseq [database (data-studio.db/databases db-ids)]
      (try
        (binding [driver.settings/*allow-testing-h2-connections* true
                  driver.settings/*allow-testing-sqlite-connections* true]
          (driver.u/can-connect-with-details? (:engine database) (:details database) :throw-exceptions))
        nil
        (catch Throwable e
          (log/warn (u/format-color :red "Cannot connect to database %s in order to sync tables" (:id database)))
          (throw (ex-info (ex-message e) {:status-code 422})))))
    (doseq [table tables]
      (sync-schema-async! table api/*current-user-id*))))

(api.macros/defendpoint :post "/rescan-values" :- :nil
  "Batch version of /table/:id/rescan_values. Takes an abstract table selection as /table/edit does."
  [_
   _
   body :- ::table-selectors]
  (api/check-data-studio-access)
  (let [tables (writable-tables (data-studio.db/tables-matching-selectors-in-id-order body))]
    ;; same permission skip as the single-table api, see comment in /:id/rescan_values
    (doseq [table tables]
      (events/publish-event! :event/table-manual-scan {:object table :user-id api/*current-user-id*})
      (request/as-admin
        (quick-task/submit-task! #(sync/update-field-values-for-table! table))))))

(api.macros/defendpoint :post "/discard-values" :- :nil
  "Batch version of /table/:id/discard_values. Takes an abstract table selection as /table/edit does."
  [_
   _
   body :- ::table-selectors]
  (api/check-data-studio-access)
  (let [tables (writable-tables (data-studio.db/tables-matching-selectors-in-id-order body))]
    (data-studio.db/delete-field-values-for-tables! (map :id tables))
    nil))

(def ^{:arglists '([request respond raise])} routes
  "`/api/data-studio/table` routes."
  (api.macros/ns-handler *ns* +auth))
