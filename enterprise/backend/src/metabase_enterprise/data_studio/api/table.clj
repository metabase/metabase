(ns metabase-enterprise.data-studio.api.table
  "/api/ee/data-studio/table endpoints for bulk table operations (enterprise-only endpoints)."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.core :as collection]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
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

;;; ------------------------------------------------ Response Schemas ------------------------------------------------

(mr/def ::publish-tables-response
  "Schema for /publish-tables endpoint response. Matches frontend PublishTablesResponse type."
  [:map
   [:target_collection [:maybe (ms/InstanceOf :model/Collection)]]])

(defn- can-publish?
  "Publishing a table means that it's now query-able by a new set of people. So we should not allow you to publish a
  table if you don't *already* have permissions to query it - otherwise, maybe you can just publish it to circumvent your
  lack of query permissions."
  [table]
  (and (mi/can-write? table) (mi/can-query? table)))

(defn- can-publish-all-tables?
  "This function returns `true` iff you have permission to publish every table passed."
  [table-ids]
  (every? can-publish? (when (seq table-ids)
                         (t2/select :model/Table :id [:in table-ids]))))

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
    (api/check-403 (can-publish-all-tables? table-ids-to-update))
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
    (api/check-403 (can-publish-all-tables? table-ids-to-update))
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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-studio/table` routes."
  (api.macros/ns-handler *ns* +auth))
