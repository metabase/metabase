(ns metabase.segments.models.segment
  "A Segment is a saved MBQL 'macro', expanding to a `:filter` subclause. It is passed in as a `:filter` subclause but is
  replaced by the `expand-macros` middleware with the appropriate clauses."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.search.core :as search]
   [metabase.segments.schema :as segments.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(methodical/defmethod t2/table-name :model/Segment [_model] :segment)
(methodical/defmethod t2/model-for-automagic-hydration [:default :segment] [_original-model _k] :model/Segment)

(defn- validate-mbql5-definition
  "Validate that an MBQL 5 segment definition has the correct structure."
  [definition]
  (when (seq definition)
    (mu/validate-throw ::segments.schema/segment definition)
    definition))

(defn- normalize-segment-definition
  "Normalize segment definition.
  Accepts:
  - MBQL 5 full queries (passed through)
  - MBQL 4 full queries (from serialization - converted to MBQL 5)
  - MBQL 4 fragments (for backward compat during migration - wrapped then converted)
  Empty seqs are normalized to `{}`."
  [definition table-id database-id]
  (if (seq definition)
    (u/prog1 (-> (case (lib/normalized-mbql-version definition)
                   (:mbql-version/mbql5 :mbql-version/legacy)
                   definition
                   ;; default MBQL4 fragment
                   (let [definition
                         (if (:aggregation definition)
                           (do
                             (log/warn "Stripping :aggregation from MBQL4 segment definition during migration"
                                       {:segment-definition definition})
                             (dissoc definition :aggregation))
                           definition)]
                     {:database database-id
                      :type :query
                      :query (merge {:source-table table-id} definition)}))
                 lib-be/normalize-query)
      (validate-mbql5-definition <>))
    {}))

(def ^:private transform-segment-definition
  "Transform for segment definitions. Only handles JSON serialization/deserialization.
  Normalization and validation happen in before-insert and after-select hooks."
  {:in mi/json-in
   :out mi/json-out-with-keywordization})

(t2/deftransforms :model/Segment
  {:definition transform-segment-definition})

(doto :model/Segment
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod mi/can-read? :model/Segment
  ([instance]
   (let [table (:table (t2/hydrate instance :table))]
     (perms/user-has-permission-for-table?
      api/*current-user-id*
      :perms/manage-table-metadata
      :yes
      (:db_id table)
      (u/the-id table))))
  ([model pk]
   (mi/can-read? (t2/select-one model pk))))

;; Segments can be created by
;; a) superusers
;; b) OR data analysts with unrestricted view-data permissions
;; But ONLY if the parent table is editable (not in a remote-synced collection in read-only mode).
(defmethod mi/can-write? :model/Segment
  ([instance]
   (let [table (or (:table instance)
                   (t2/select-one :model/Table :id (:table_id instance)))]
     (and (or (mi/superuser?)
              (and api/*is-data-analyst?*
                   (perms/user-has-permission-for-table?
                    api/*current-user-id*
                    :perms/view-data
                    :unrestricted
                    (:db_id table)
                    (u/the-id table))))
          (remote-sync/table-editable? table))))
  ([model pk]
   (mi/can-write? (t2/select-one model pk))))

;; Segments can be created by
;; a) superusers
;; b) OR data analysts with unrestricted view-data permissions
;; But ONLY if the parent table is editable (not in a remote-synced collection in read-only mode).
(defmethod mi/can-create? :model/Segment
  [_model instance]
  (let [table (or (:table instance)
                  (t2/select-one :model/Table :id (:table_id instance)))]
    (and (or (mi/superuser?)
             (and api/*is-data-analyst?*
                  (perms/user-has-permission-for-table?
                   api/*current-user-id*
                   :perms/view-data
                   :unrestricted
                   (:db_id table)
                   (u/the-id table))))
         (remote-sync/table-editable? table))))

(methodical/defmethod t2/batched-hydrate [:model/Segment :can_write]
  "Batched hydration for :can_write on segments. First hydrates :table for all segments,
   then pre-fetches collection is_remote_synced values for those tables, and calls can-write?
   on each segment. This avoids N+1 queries when checking permissions for multiple segments."
  [_model k segments]
  (let [segments-with-tables (t2/hydrate (remove nil? segments) :table)
        ;; Get all unique collection IDs from the hydrated tables
        collection-ids (->> segments-with-tables
                            (keep (comp :collection_id :table))
                            distinct)
        ;; Batch fetch is_remote_synced for all collections
        collection-synced-map (if (seq collection-ids)
                                (into {}
                                      (map (juxt :id :is_remote_synced))
                                      (t2/select :model/Collection :id [:in collection-ids]))
                                {})
        ;; Associate collection info with each segment's table
        segments-with-collection (for [segment segments-with-tables
                                       :let [table (:table segment)
                                             coll-id (:collection_id table)]]
                                   (if (and table coll-id)
                                     (assoc-in segment [:table :collection]
                                               {:id coll-id
                                                :is_remote_synced (get collection-synced-map coll-id false)})
                                     segment))]
    (mi/instances-with-hydrated-data
     segments k
     #(u/index-by :id mi/can-write? segments-with-collection)
     :id
     {:default false})))

(defn- migrated-segment-definition
  [{:keys [definition], table-id :table_id}]
  (let [database-id (t2/select-one-fn :db_id :model/Table :id table-id)]
    (normalize-segment-definition definition table-id database-id)))

(t2/define-before-insert :model/Segment
  [{:keys [definition] :as segment}]
  (let [segment (cond-> segment
                  (some? definition) (assoc :definition (migrated-segment-definition segment)))]
    (when (seq (:definition segment))
      (lib/check-segment-overwrite nil (:definition segment)))
    segment))

(t2/define-before-update :model/Segment [{:keys [id] :as segment}]
  ;; throw an Exception if someone tries to update creator_id
  (when (contains? (t2/changes segment) :creator_id)
    (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a Segment."))))
  ;; normalize and check for cycles if definition is being updated
  (if-let [def-change (:definition (t2/changes segment))]
    (let [normalized-def (migrated-segment-definition (assoc segment :definition def-change))]
      (when (seq normalized-def)
        (lib/check-segment-overwrite id normalized-def))
      (assoc segment :definition normalized-def))
    segment))

(defmethod mi/perms-objects-set :model/Segment
  [segment read-or-write]
  (let [table (or (:table segment)
                  (t2/select-one ['Table :db_id :schema :id] :id (u/the-id (:table_id segment))))]
    (mi/perms-objects-set table read-or-write)))

(defn- maybe-migrated-segment-definition
  [segment]
  (try
    (migrated-segment-definition segment)
    (catch Throwable e
      (log/error e "Error upgrading segment definition:" (ex-message e))
      nil)))

(t2/define-after-select :model/Segment
  [{:keys [definition] :as segment}]
  (cond-> segment
    (some? definition) (assoc :definition (maybe-migrated-segment-definition segment))))

(mu/defn- definition-description :- [:maybe ::lib.schema.common/non-blank-string]
  "Calculate a nice description of a Segment's definition."
  [{:keys [definition], :as _segment} :- (ms/InstanceOf :model/Segment)]
  (when (some? definition)
    (try
      (lib/describe-top-level-key definition :filters)
      (catch Throwable e
        (log/error e "Error calculating Segment description:" (ex-message e))
        nil))))

(methodical/defmethod t2.hydrate/batched-hydrate [:model/Segment :definition_description]
  [_model _key segments]
  (for [segment segments]
    (assoc segment :definition_description (definition-description segment))))

;;; ------------------------------------------------ Serialization ---------------------------------------------------

(defmethod serdes/hash-fields :model/Segment
  [_segment]
  [:name (serdes/hydrated-hash :table) :created_at])

(defmethod serdes/dependencies "Segment" [{:keys [definition table_id]}]
  (set/union #{(serdes/table->path table_id)}
             (serdes/mbql-deps definition)))

(defmethod serdes/storage-path "Segment" [segment _ctx]
  (let [{:keys [id label]} (-> segment serdes/path last)]
    (-> segment
        :table_id
        serdes/table->path
        serdes/storage-path-prefixes
        (concat ["segments" (serdes/storage-leaf-file-name id label)]))))

(defmethod serdes/make-spec "Segment" [_model-name _opts]
  {:copy [:name :points_of_interest :archived :caveats :description :entity_id :show_in_getting_started]
   :skip [:dependency_analysis_version]
   :transform {:created_at (serdes/date)
               :table_id (serdes/fk :model/Table)
               :creator_id (serdes/fk :model/User)
               :definition {:export serdes/export-mbql :import serdes/import-mbql}}})

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(search/define-spec "segment"
  {:model :model/Segment
   :attrs {:archived true
           :collection-id false
           :creator-id false
           :database-id :table.db_id
           ;; should probably change this, but will break legacy search tests
           :created-at false
           :updated-at true}
   :search-terms [:name :description]
   :render-terms {:table-id :table_id
                  :table_description :table.description
                  :table_name :table.name
                  :table_schema :table.schema}
   :joins {:table [:model/Table [:= :table.id :this.table_id]]}})
