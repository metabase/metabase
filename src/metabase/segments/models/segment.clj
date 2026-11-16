(ns metabase.segments.models.segment
  "A Segment is a saved MBQL 'macro', expanding to a `:filter` subclause. It is passed in as a `:filter` subclause but is
  replaced by the `expand-macros` middleware with the appropriate clauses."
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.search.core :as search]
   [metabase.segments.db :as segments.db]
   [metabase.segments.schema :as segments.schema]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Segment [_model] :segment)
(methodical/defmethod t2/model-for-automagic-hydration [:default :segment] [_original-model _k] :model/Segment)

(t2/deftransforms :model/Segment
  {:definition lib-be/transform-query})

(doto :model/Segment
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/dependencies))

(defn- definition-table-id
  "The id of the Table `definition`, a full query, is built on."
  [definition]
  (lib/primary-source-table-id (lib-be/normalize-query definition)))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-definition
  "Throws unless `definition` is a full query that fits a Segment."
  [definition]
  (when-not (and (seq definition)
                 (#{:mbql-version/mbql5 :mbql-version/legacy} (lib/normalized-mbql-version definition)))
    (throw (ex-info (tru "Segment definition must be a full query with a source table.") {:status-code 400})))
  (mu/validate-throw ::segments.schema/definition (lib-be/normalize-query definition)))

(t2/define-before-insert :model/Segment
  [{:keys [definition] :as segment}]
  (check-definition definition)
  (assoc segment :table_id (definition-table-id definition)))

(t2/define-before-update :model/Segment
  [{:keys [id definition] :as segment}]
  (let [changes (t2/changes segment)]
    (when (contains? changes :creator_id)
      (throw (ex-info (tru "You cannot update the creator_id of a Segment.") {:status-code 400})))
    (when (and (contains? changes :table_id) (not (contains? changes :definition)))
      (throw (ex-info (tru "The table of a Segment is derived from its definition.") {:status-code 400})))
    (when (contains? changes :definition)
      (check-definition definition)
      (lib/check-segment-overwrite id (lib-be/normalize-query definition)))
    (cond-> segment
      (contains? changes :definition) (assoc :table_id (definition-table-id definition)))))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Segment :can_read]
  "Whether the current user can read each of `segments`, which they can when they read its Table, the Tables answered
  together."
  [_model k segments]
  (let [rows  (t2/hydrate (into [] (remove nil?) segments) [:table :can_read])
        flags (into {} (map (juxt :id (comp mi/can-read? :table))) rows)]
    (for [segment segments]
      (when segment
        (vary-meta segment assoc k (get flags (:id segment) false))))))

(defn- writable-table-ids
  "The ids of those of `tables` whose Segments the current user can write: every Table for a superuser, those a data
  analyst has unrestricted view-data permissions on, answered together, and never one a read-only instance syncs."
  [tables]
  (let [permitted (cond
                    (mi/superuser?)
                    tables

                    (api/entitled-data-analyst?)
                    (let [values (perms/table-permissions-for-user (perms/user-info api/*current-user-id*)
                                                                   :perms/view-data
                                                                   (into {} (map (juxt :id :db_id)) tables))]
                      (filter #(perms/at-least-as-permissive? :perms/view-data (get values (:id %)) :unrestricted)
                              tables))

                    :else
                    [])]
    (into #{} (comp (filter collection/remote-sync-writable-table?) (map :id)) permitted)))

(methodical/defmethod t2/batched-hydrate [:model/Segment :can_write]
  "Whether the current user can write each of `segments`, which they can when they write Segments of its Table."
  [_model k segments]
  (let [rows     (t2/hydrate (into [] (remove nil?) segments) :table)
        writable (writable-table-ids (into [] (comp (keep :table) (m/distinct-by :id)) rows))]
    (for [segment segments]
      (when segment
        (assoc segment k (contains? writable (:table_id segment)))))))

(defn- definition-writable?
  "Whether the current user can write Segments of the Table `definition` is built on."
  [definition]
  (let [table (some-> definition not-empty definition-table-id segments.db/table)]
    (boolean (and table (seq (writable-table-ids [table]))))))

(defmethod mi/can-create? :model/Segment
  [_model {:keys [definition]}]
  (definition-writable? definition))

(defenterprise sandboxes-allow-segment-update?
  "Whether sandboxing lets the current user apply `changes` to `segment`, which OSS always does."
  metabase-enterprise.sandbox.models.sandbox
  [_segment _changes]
  true)

(defmethod mi/can-update? :model/Segment
  [segment changes]
  (and (mi/can-write? segment)
       (or (not (contains? changes :definition))
           (definition-writable? (:definition changes)))
       (sandboxes-allow-segment-update? segment changes)))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(mu/defn- definition-description :- [:maybe ::lib.schema.common/non-blank-string]
  "Calculate a nice description of a Segment's definition."
  [{:keys [definition], :as _segment} :- (ms/InstanceOf :model/Segment)]
  (when (some? definition)
    (try
      (lib/describe-top-level-key definition :filters)
      (catch Throwable e
        (log/errorf "Error calculating Segment description: %s" (ex-message e))
        nil))))

(methodical/defmethod t2.hydrate/batched-hydrate [:model/Segment :definition_description]
  [_model _key segments]
  (for [segment segments]
    (assoc segment :definition_description (definition-description segment))))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serialization/spec :model/Segment [_]
  {:schema    ::segments.schema/external-segment
   :copy      [:name :points_of_interest :archived :caveats :description :entity_id :show_in_getting_started]
   :skip      [:table_id]
   :transform {:creator_id serialization/user-transform
               :definition serialization/mbql-transform}
   :defaults  {:archived false :show_in_getting_started false}})

(defmethod serialization/import-dependencies :model/Segment [_ entities]
  (mapv (fn [{:keys [definition]}]
          (serialization/import-mbql-dependencies definition))
        entities))

(defmethod serialization/storage-paths :model/Segment [_ entities _ctx]
  (mapv (fn [segment]
          (let [table-path (-> segment :definition serialization/serialized-query-source-table)]
            (into (serialization/storage-path-prefixes table-path)
                  [{:label "segments"} {:label (:name segment) :key (:entity_id segment)}])))
        entities))

;;; -------------------------------------------------- Remote sync ---------------------------------------------------

(defmethod remote-sync/spec :model/Segment
  [_model]
  {:synced-items         segments.db/synced-segment-items
   :synced-filter-clause segments.db/synced-segments-clause})

;;; ----------------------------------------------------- Search -----------------------------------------------------

(search/define-spec "segment"
  {:model :model/Segment
   :attrs {:archived true
           :collection-id false
           :creator-id false
           :database-id :table.db_id
           ;; should probably change this, but will break legacy search tests
           :created-at false
           :updated-at true
           ;; A segment on a Library table inherits the table's library ranking boost and curated status.
           :root-collection-type {:fn collection/table-root-collection-type}}
   :search-terms [:name :description]
   :render-terms {:table-id                  :table_id
                  :table_description         :table.description
                  :table_name                :table.name
                  :table_display_name        :table.display_name
                  :table_schema              :table.schema
                  ;; The parent table's collection, for [[collection/table-root-collection-type]].
                  ;; Listing these terms also reindexes a segment when its table moves into or out of the Library.
                  :table-collection-id       :table.collection_id
                  :table-is-published        :table.is_published
                  :table-collection-location :collection.location
                  :table-collection-type     :collection.type}
   ;; Only published tables count as library content, matching the table spec's own collection join.
   :joins {:table      [:model/Table [:= :table.id :this.table_id]]
           :collection [:model/Collection
                        [:and
                         [:= :table.is_published true]
                         [:= :collection.id :table.collection_id]]]}})
