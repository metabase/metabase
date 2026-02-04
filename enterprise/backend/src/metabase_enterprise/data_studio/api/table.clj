(ns metabase-enterprise.data-studio.api.table
  "/api/ee/data-studio/table endpoints for bulk table operations."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.core :as collection]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]))

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

;;; ------------------------------------------------ Remapping Graph Traversal ------------------------------------------------

(defn- remapped-table-ids
  "Find tables connected via FK remapping (Dimensions).
  `input-field` and `output-field` are field aliases (:source_field or :target_field).
  Returns table IDs from `output-field` that are connected to `tables` via `input-field`.
  `tables` can be a set of table IDs or a HoneySQL subquery map."
  [input-field output-field tables]
  (if (empty? tables)
    #{}
    (let [input-table-id  (keyword (name input-field) "table_id")
          output-table-id (keyword (name output-field) "table_id")]
      (into #{} (map :table_id)
            (t2/reducible-query {:select [[output-table-id :table_id]]
                                 :from   [[(t2/table-name :model/Dimension) :dim]]
                                 :join   [[(t2/table-name :model/Field) :source_field]
                                          [:= :dim.field_id :source_field.id]
                                          [(t2/table-name :model/Field) :target_field]
                                          [:= :dim.human_readable_field_id :target_field.id]]
                                 :where  [:and
                                          [:= :dim.type "external"]
                                          [:in input-table-id tables]
                                          [:not [:in output-table-id tables]]]})))))

(defn- upstream-table-ids
  "Given a table selector (set of IDs or subquery), find all tables that these tables depend on
  via FK remapping (Dimensions)."
  [source-tables]
  (remapped-table-ids :source_field :target_field source-tables))

(defn- downstream-table-ids
  "Given a table selector (set of IDs or subquery), find all tables that depend on these tables
  via FK remapping (Dimensions)."
  [target-tables]
  (remapped-table-ids :target_field :source_field target-tables))

(defn- table-subquery
  "Create a subquery that selects table IDs matching the given WHERE clause."
  [where]
  {:select [:id] :from [(t2/table-name :model/Table)] :where where})

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
  "Get all upstream table IDs recursively for tables matching the given WHERE clause.
  The first hop uses a subquery to avoid materializing potentially millions of IDs;
  subsequent hops use IDs since remappings are rare."
  [source-table-where]
  (let [initial-ids (upstream-table-ids (table-subquery source-table-where))]
    (if (empty? initial-ids)
      #{}
      (traverse-graph upstream-table-ids initial-ids))))

(defn- all-downstream-table-ids
  "Get all downstream table IDs recursively for tables matching the given WHERE clause.
  The first hop uses a subquery to avoid materializing potentially millions of IDs;
  subsequent hops use IDs since remappings are rare."
  [target-table-where]
  (let [initial-ids (downstream-table-ids (table-subquery target-table-where))]
    (if (empty? initial-ids)
      #{}
      (traverse-graph downstream-table-ids initial-ids))))

(mr/def ::data-sources
  (into [:enum {:decode/string keyword}] table/data-sources))

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

(mr/def ::publish-tables-response
  "Schema for /publish-tables endpoint response. Matches frontend PublishTablesResponse type."
  [:map
   [:target_collection [:maybe (ms/InstanceOf :model/Collection)]]])

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
  ;; sync any tables that are changed from hidden to something else
  (sync-unhidden-tables (when (and (contains? body :data_layer) (not= :hidden data_layer))
                          (filter #(= :hidden (:data_layer %)) existing-tables))))

(api.macros/defendpoint :post "/edit" :- [:map {:closed true}]
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
  (api/check-data-analyst)
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
      (maybe-sync-unhidden-tables! existing-tables set-map)
      ;; Publish update events for remote sync tracking
      (let [updated-tables (t2/select :model/Table :id [:in table-ids])]
        (doseq [table updated-tables]
          (events/publish-event! :event/table-update {:object  table
                                                      :user-id api/*current-user-id*}))))
    {}))

(api.macros/defendpoint :post "/selection" :- ::bulk-table-selection-info
  "Gets information about selected tables"
  [_route-params
   _query-params
   body :- ::table-selectors]
  (api/check-data-analyst)
  (let [fields            [:model/Table :id :db_id :name :display_name :schema :is_published]
        where             (table-selectors->filter (select-keys body [:database_ids :schema_ids :table_ids]))
        selected-tables   (t2/select fields {:where where :limit 2})
        selected-table    (when-not (next selected-tables)
                            (first selected-tables))
        upstream-ids      (all-upstream-table-ids where)
        downstream-ids    (all-downstream-table-ids where)
        upstream-tables   (when (seq upstream-ids)
                            (t2/select fields :id [:in upstream-ids]))
        downstream-tables (when (seq downstream-ids)
                            (t2/select fields :id [:in downstream-ids]))]
    {:selected_table              selected-table
     :published_downstream_tables (filterv :is_published downstream-tables)
     :unpublished_upstream_tables (filterv (complement :is_published) upstream-tables)}))

(api.macros/defendpoint :post "/publish-tables" :- ::publish-tables-response
  "Set collection for each of selected tables and all upstream dependencies recursively."
  [_route-params
   _query-params
   body :- ::table-selectors]
  (api/check-data-analyst)
  (let [target-collection (api/let-404 [colls (seq (t2/select :model/Collection
                                                              :type collection/library-data-collection-type
                                                              {:limit 2}))]
                            (if (next colls)
                              (throw (ex-info (tru "Multiple library-data collections found.")
                                              {:status-code 409}))
                              (first colls)))
        where             (table-selectors->filter (select-keys body [:database_ids :schema_ids :table_ids]))
        upstream-ids      (all-upstream-table-ids where)
        update-where      (if (seq upstream-ids)
                            [:or where [:in :id upstream-ids]]
                            where)
        ;; Get table IDs before update for event publishing
        table-ids-to-update (t2/select-pks-set :model/Table {:where update-where})]
    (t2/query {:update (t2/table-name :model/Table)
               :set    {:collection_id (:id target-collection)
                        :is_published  true}
               :where  update-where})
    ;; Publish events for audit log and remote sync tracking
    (when (seq table-ids-to-update)
      (let [updated-tables (t2/select :model/Table :id [:in table-ids-to-update])]
        (doseq [table updated-tables]
          (events/publish-event! :event/table-publish {:object  table
                                                       :user-id api/*current-user-id*}))))
    {:target_collection target-collection}))

(api.macros/defendpoint :post "/unpublish-tables" :- :nil
  "Unset collection for each of selected tables and all downstream dependents recursively."
  [_route-params
   _query-params
   body :- ::table-selectors]
  (api/check-data-analyst)
  (let [where           (table-selectors->filter (select-keys body [:database_ids :schema_ids :table_ids]))
        downstream-ids  (all-downstream-table-ids where)
        update-where    (if (seq downstream-ids)
                          [:or where [:in :id downstream-ids]]
                          where)
        ;; Get table IDs before update for event publishing
        table-ids-to-update (t2/select-pks-set :model/Table {:where update-where})]
    (t2/query {:update (t2/table-name :model/Table)
               :set    {:collection_id nil
                        :is_published  false}
               :where  update-where})
    ;; Publish events for audit log and remote sync tracking
    (when (seq table-ids-to-update)
      (let [updated-tables (t2/select :model/Table :id [:in table-ids-to-update])]
        (doseq [table updated-tables]
          (events/publish-event! :event/table-unpublish {:object  table
                                                         :user-id api/*current-user-id*}))))
    nil))

(defn- sync-schema-async!
  [table user-id]
  (events/publish-event! :event/table-manual-sync {:object table :user-id user-id})
  (quick-task/submit-task! #(database-routing/with-database-routing-off (sync/sync-table! table))))

(api.macros/defendpoint :post "/sync-schema" :- :nil
  "Batch version of /table/:id/sync_schema. Takes an abstract table selection as /table/edit does.
  - Currently checks policy before returning (so you might receive a 4xx on e.g. AuthZ policy failure)
  - The sync itself is however, asynchronous. This call may return before all tables synced."
  [_
   _
   body :- ::table-selectors]
  (api/check-data-analyst)
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
      (sync-schema-async! table api/*current-user-id*))))

(api.macros/defendpoint :post "/rescan-values" :- :nil
  "Batch version of /table/:id/rescan_values. Takes an abstract table selection as /table/edit does."
  [_
   _
   body :- ::table-selectors]
  (api/check-data-analyst)
  (let [tables (t2/select :model/Table {:where (table-selectors->filter body), :order-by [[:id]]})]
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
  (api/check-data-analyst)
  (let [tables (t2/select :model/Table {:where (table-selectors->filter body), :order-by [[:id]]})]
    (let [field-ids-to-delete-q {:select [:id]
                                 :from   [(t2/table-name :model/Field)]
                                 :where  [:in :table_id (map :id tables)]}]
      (t2/delete! (t2/table-name :model/FieldValues) :field_id [:in field-ids-to-delete-q]))
    nil))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-studio/table` routes."
  (api.macros/ns-handler *ns* +auth))
