(ns metabase-enterprise.data-studio.api.table
  "/api/ee/data-studio/table endpoints for bulk table operations (enterprise-only endpoints)."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.data-studio.db :as data-studio.db]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.core :as collection]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::table-selectors
  [:map
   ;; disjunctive filters (e.g. db_id IN $database_ids OR id IN $table_ids)
   [:database_ids {:optional true} [:sequential ms/PositiveInt]]
   [:schema_ids {:optional true} [:sequential :string]]
   [:table_ids {:optional true} [:sequential ms/PositiveInt]]])

(mr/def ::publish-table-selectors
  [:merge
   ::table-selectors
   [:map
    [:collection_id ms/PositiveInt]]])

(defn- body->table-selectors
  "The table selectors of a request `body`, as [[data-studio.db/table-ids-matching-selectors]] expects them."
  [{:keys [database_ids table_ids schema_ids]}]
  {:database-ids database_ids, :table-ids table_ids, :schema-ids schema_ids})

;;; ------------------------------------------------ Remapping Graph Traversal ------------------------------------------------

(defn- remapped-table-ids
  "Find tables connected via FK remapping (Dimensions).
  `input-field` and `output-field` are field aliases (:source_field or :target_field).
  Returns table IDs from `output-field` that are connected to `tables` via `input-field`.
  `tables` can be a set of table IDs or a table-selectors map."
  [input-field output-field tables]
  (if (empty? tables)
    #{}
    (into #{} (map :table_id)
          (data-studio.db/remapped-table-ids-reducible input-field output-field tables))))

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
  "Get all upstream table IDs recursively for tables matching the given table selectors.
  The first hop uses a subquery to avoid materializing potentially millions of IDs;
  subsequent hops use IDs since remappings are rare."
  [source-table-selectors]
  (let [initial-ids (upstream-table-ids source-table-selectors)]
    (if (empty? initial-ids)
      #{}
      (traverse-graph upstream-table-ids initial-ids))))

(defn- all-downstream-table-ids
  "Get all downstream table IDs recursively for tables matching the given table selectors.
  The first hop uses a subquery to avoid materializing potentially millions of IDs;
  subsequent hops use IDs since remappings are rare."
  [target-table-selectors]
  (let [initial-ids (downstream-table-ids target-table-selectors)]
    (if (empty? initial-ids)
      #{}
      (traverse-graph downstream-table-ids initial-ids))))

;;; ------------------------------------------------ Collection lifecycle hook ------------------------------------------------

(defenterprise unpublish-downstream-fk-tables!
  "When tables are unpublished because their Library collection was archived or deleted, also unpublish any tables that
  depend on them via FK remapping (Dimensions), so implicit joins are not broken. Mirrors the force-unpublish behavior
  of the `/unpublish-tables` endpoint. `seed-table-ids` are the tables that were just unpublished."
  :feature :library
  [seed-table-ids]
  (when (seq seed-table-ids)
    (let [downstream-ids      (all-downstream-table-ids {:table-ids seed-table-ids})
          table-ids-to-update (when (seq downstream-ids)
                                (data-studio.db/published-table-ids downstream-ids))]
      (when (seq table-ids-to-update)
        (data-studio.db/unpublish-tables! table-ids-to-update)
        ;; Publish events for audit log and remote sync tracking
        (let [updated-tables (data-studio.db/tables table-ids-to-update)]
          (doseq [table updated-tables]
            (events/publish-event! :event/table-unpublish {:object  table
                                                           :user-id api/*current-user-id*})))))))

;;; ------------------------------------------------ Response Schemas ------------------------------------------------

(mr/def ::publish-tables-response
  "Schema for /publish-tables endpoint response. Matches frontend PublishTablesResponse type."
  [:map
   [:target_collection [:maybe (ms/InstanceOf :model/Collection)]]])

(def ^:private PublishingUser
  [:map {:closed true}
   [:id ms/PositiveInt]
   [:common_name :string]])

(def ^:private PublishingInfo
  [:map {:closed true}
   [:published_at ms/TemporalInstant]
   [:published_by [:maybe PublishingUser]]])

(defn- publishing-info
  [table-id]
  (when-let [{:keys [timestamp topic], user-id :user_id}
             ;; Serialization can restore `is_published` without a publish event, so a later unpublish
             ;; invalidates older publishing details.
             (data-studio.db/latest-table-publishing-event table-id)]
    (when (= topic :table-publish)
      {:published_at timestamp
       :published_by (when user-id
                       (some-> (data-studio.db/user-name-and-email user-id)
                               (select-keys [:id :common_name])))})))

(api.macros/defendpoint :get "/:id/publishing-info" :- [:maybe PublishingInfo]
  "Return the latest valid publishing information for a published table, or no content when unavailable."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body
   _request]
  (api/check-data-analyst)
  (let [table (api/read-check :model/Table id)]
    (when (:is_published table)
      (publishing-info id))))

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
                         (data-studio.db/tables table-ids))))

(api.macros/defendpoint :post "/publish-tables" :- ::publish-tables-response
  "Set collection for each of selected tables and all upstream dependencies recursively."
  [_route-params
   _query-params
   body :- ::publish-table-selectors]
  (api/check-data-analyst)
  (let [target-collection  (api/check-404 (data-studio.db/collection (:collection_id body)))
        _                  (api/check-400 (= (:type target-collection) collection/library-data-collection-type)
                                          (tru "Tables can only be published to Library/Data collections."))
        selectors          (body->table-selectors body)
        upstream-ids       (all-upstream-table-ids selectors)
        ;; Don't move already-published upstream tables; only publish unpublished ones. Get table IDs before update
        ;; for event publishing.
        table-ids-to-update (data-studio.db/table-ids-matching-selectors selectors upstream-ids :unpublished)]
    (api/check-403 (can-publish-all-tables? table-ids-to-update))
    (when (seq table-ids-to-update)
      (data-studio.db/publish-tables! table-ids-to-update (:id target-collection))
      ;; Publish events for audit log and remote sync tracking
      (let [updated-tables (data-studio.db/tables table-ids-to-update)]
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
  (let [selectors       (body->table-selectors body)
        downstream-ids  (all-downstream-table-ids selectors)
        ;; Get table IDs before update for event publishing
        table-ids-to-update (data-studio.db/table-ids-matching-selectors selectors downstream-ids :any)]
    (api/check-403 (can-publish-all-tables? table-ids-to-update))
    (when (seq table-ids-to-update)
      (data-studio.db/unpublish-tables! table-ids-to-update)
      ;; Publish events for audit log and remote sync tracking
      (let [updated-tables (data-studio.db/tables table-ids-to-update)]
        (doseq [table updated-tables]
          (events/publish-event! :event/table-unpublish {:object  table
                                                         :user-id api/*current-user-id*}))))
    nil))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-studio/table` routes."
  (api.macros/ns-handler *ns* +auth))
