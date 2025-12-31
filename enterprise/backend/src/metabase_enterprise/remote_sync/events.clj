(ns metabase-enterprise.remote-sync.events
  "Event handlers for tracking model changes in remote-synced collections.

   Listens to Metabase model events (create/update/delete) and maintains the
   RemoteSyncObject table with the current sync status of each tracked model.
   This enables the remote sync system to know which objects have changed
   since the last sync operation.

   Handlers are defined using the `defmodel-change-handler` macro which:
   - Derives event hierarchies for create/update/delete events
   - Checks if the model is in a remote-synced collection
   - Creates or updates RemoteSyncObject entries with denormalized model details

   Tracked model types:
   - Card, Dashboard, Document, NativeQuerySnippet, Timeline, Collection
   - Table (when published in a remote-synced collection)
   - Field, Segment (when belonging to a published table in a remote-synced collection)"
  (:require
   [java-time.api :as t]
   [metabase.collections.core :as collections]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; Helper functions for model change tracking

(defn- model-in-remote-synced-collection?
  "Checks if a model (card, dashboard, document) is in a remote-synced collection. Takes a model instance with a
  collection_id field. Returns true if the model is in a remote-synced collection, false otherwise."
  [{:keys [collection_id]}]
  (boolean
   (collections/remote-synced-collection? collection_id)))

(defn- create-or-update-remote-sync-object-entry!
  "Creates or updates a remote sync object entry for a model change.

   Parameters:
   - model-type: Type of model ('Card', 'Dashboard', 'Document', 'Collection', etc.)
   - model-id: ID of the affected model
   - status: Sync status ('create', 'update', 'removed', 'delete', 'error', 'synced')
   - hydrate-details-fn: Function that takes model-id and returns a map with :name, :collection_id,
                         and optionally :display, :table_id, :table_name"
  [model-type model-id status hydrate-details-fn]
  (let [existing (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id)]
    (cond
      (not existing)
      (let [model-details (hydrate-details-fn model-id)]
        (t2/insert! :model/RemoteSyncObject
                    {:model_type model-type
                     :model_id model-id
                     :model_name (:name model-details)
                     :model_collection_id (:collection_id model-details)
                     :model_display (some-> model-details :display name)
                     :model_table_id (:table_id model-details)
                     :model_table_name (:table_name model-details)
                     :status status
                     :status_changed_at (t/offset-date-time)}))

      ;; If the entity was created and then removed/deleted before sync, just delete the entry from tracking
      (and (= "create" (:status existing)) (contains? #{"removed" "delete"} status))
      (t2/delete! :model/RemoteSyncObject (:id existing))

      ;; Just update the status, object doesn't exist to update other info
      (= "delete" (:status existing))
      (t2/update! :model/RemoteSyncObject (:id existing)
                  {:status status
                   :status_changed_at (t/offset-date-time)})

      ;; If the entry was created, the status should remain create until synced
      (not (= "create" (:status existing)))
      (let [model-details (hydrate-details-fn model-id)]
        (t2/update! :model/RemoteSyncObject (:id existing)
                    {:status status
                     :status_changed_at (t/offset-date-time)
                     :model_name (:name model-details)
                     :model_collection_id (:collection_id model-details)
                     :model_display (some-> model-details :display name)
                     :model_table_id (:table_id model-details)
                     :model_table_name (:table_name model-details)})))))

;; Model change tracking event handlers

(defmacro ^:private defmodel-change-handler
  "Defines event derivations and handler for a standard model change event.

   Usage:
     (defmodel-change-handler card
       {:model-type       \"Card\"
        :event-prefix     :event/card
        :log-name         \"card\"
        :hydrate-details  (fn [id] (t2/select-one [:model/Card :name :collection_id :display] :id id))})

   Configuration options:
   - :model-type       - String for RemoteSyncObject model_type (e.g. \"Card\")
   - :event-prefix     - Keyword prefix for events (e.g. :event/card)
   - :log-name         - String for log messages (e.g. \"card\")
   - :hydrate-details  - Function (fn [model-id]) that returns map with :name, :collection_id,
                         and optionally :display, :table_id, :table_name
   - :archived-key     - Key to check for archived status (default :archived)
   - :in-sync-pred     - Predicate fn (default model-in-remote-synced-collection?)"
  [event-group {:keys [model-type event-prefix log-name hydrate-details archived-key in-sync-pred]
                :or   {archived-key :archived
                       in-sync-pred `model-in-remote-synced-collection?}}]
  (let [parent-kw  (keyword (str *ns*) (str (name event-group) "-change-event"))
        create-kw  (keyword (namespace event-prefix) (str (name event-prefix) "-create"))
        update-kw  (keyword (namespace event-prefix) (str (name event-prefix) "-update"))
        delete-kw  (keyword (namespace event-prefix) (str (name event-prefix) "-delete"))]
    `(do
       (derive ~parent-kw :metabase/event)
       (derive ~create-kw ~parent-kw)
       (derive ~update-kw ~parent-kw)
       (derive ~delete-kw ~parent-kw)

       (methodical/defmethod events/publish-event! ~parent-kw
         [topic# event#]
         (let [{:keys [~'object]} event#
               in-remote-synced?# (~in-sync-pred ~'object)
               existing-entry# (t2/select-one :model/RemoteSyncObject
                                              :model_type ~model-type
                                              :model_id (:id ~'object))
               status# (if (get ~'object ~archived-key)
                         "delete"
                         (case topic#
                           ~create-kw "create"
                           ~update-kw "update"
                           ~delete-kw "delete"))]
           (cond
             in-remote-synced?#
             (do
               (log/infof "Creating remote sync object entry for %s %s (status: %s)"
                          ~log-name (:id ~'object) status#)
               (create-or-update-remote-sync-object-entry!
                ~model-type (:id ~'object) status# ~hydrate-details))

             (and existing-entry# (not in-remote-synced?#))
             (do
               (log/infof "%s %s moved out of remote-synced collection, marking as removed"
                          ~log-name (:id ~'object))
               (create-or-update-remote-sync-object-entry!
                ~model-type (:id ~'object) "removed" ~hydrate-details))))))))

;; Standard model change handlers

(defmodel-change-handler :card
  {:model-type       "Card"
   :event-prefix     :event/card
   :log-name         "card"
   :hydrate-details  (fn [id] (t2/select-one [:model/Card :name :collection_id :display] :id id))})

(defmodel-change-handler :dashboard
  {:model-type       "Dashboard"
   :event-prefix     :event/dashboard
   :log-name         "dashboard"
   :hydrate-details  (fn [id] (t2/select-one [:model/Dashboard :name :collection_id] :id id))})

(defmodel-change-handler :document
  {:model-type       "Document"
   :event-prefix     :event/document
   :log-name         "document"
   :hydrate-details  (fn [id] (t2/select-one [:model/Document :name :collection_id] :id id))})

(defmodel-change-handler :snippet
  {:model-type       "NativeQuerySnippet"
   :event-prefix     :event/snippet
   :log-name         "snippet"
   :hydrate-details  (fn [id] (t2/select-one [:model/NativeQuerySnippet :name :id] :id id))})

;; Collection create/update events - derive from common parent for shared handling
(derive ::collection-change-event :metabase/event)
(derive :event/collection-create ::collection-change-event)
(derive :event/collection-update ::collection-change-event)

(defn- hydrate-collection-details
  "Hydrates details for a Collection."
  [id]
  (t2/select-one [:model/Collection :name [:id :collection_id]] :id id))

(defn- hydrate-table-details
  "Hydrates details for a Table. For tables, table_id and table_name refer to themselves."
  [id]
  (when-let [table (t2/select-one [:model/Table :name :collection_id] :id id)]
    (assoc table :table_id id :table_name (:name table))))

(defn- track-published-tables-in-collection!
  "When a collection becomes remote-synced, find all published tables in it
   and create 'create' entries for them in RemoteSyncObject (if not already tracked)."
  [collection-id]
  (let [published-tables (t2/select :model/Table
                                    :collection_id collection-id
                                    :is_published true)]
    (doseq [table published-tables]
      (let [existing (t2/select-one :model/RemoteSyncObject
                                    :model_type "Table"
                                    :model_id (:id table))]
        ;; Only create entry if not already tracked or was marked as removed/synced
        (when (or (nil? existing)
                  (contains? #{"removed" "synced"} (:status existing)))
          (log/infof "Creating remote sync object entry for published table %s in newly remote-synced collection %s"
                     (:id table) collection-id)
          (create-or-update-remote-sync-object-entry! "Table" (:id table) "create" hydrate-table-details))))))

(methodical/defmethod events/publish-event! ::collection-change-event
  [topic event]
  (let [{:keys [object]} event
        is-remote-synced? (collections/remote-synced-collection? object)
        existing-entry (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id (:id object))
        was-remote-synced? (and existing-entry
                                (not (contains? #{"removed"} (:status existing-entry))))
        status (if (:archived object)
                 "delete"
                 (case topic
                   :event/collection-create "create"
                   :event/collection-update "update"))]
    (cond
      ;; Collection is remote-synced - create or update entry
      is-remote-synced?
      (do
        (log/infof "Creating remote sync object entry for collection %s (status: %s)" (:id object) status)
        (create-or-update-remote-sync-object-entry! "Collection" (:id object) status hydrate-collection-details)
        ;; If collection just became remote-synced, track all published tables in it
        (when (not was-remote-synced?)
          (track-published-tables-in-collection! (:id object))))

      ;; Collection was remote-synced but type changed - mark as removed
      (and existing-entry (not is-remote-synced?))
      (do
        (log/infof "Collection %s type changed from remote-synced, marking as removed" (:id object))
        (create-or-update-remote-sync-object-entry! "Collection" (:id object) "removed" hydrate-collection-details)))))

(defmodel-change-handler :timeline
  {:model-type       "Timeline"
   :event-prefix     :event/timeline
   :log-name         "timeline"
   :hydrate-details  (fn [id] (t2/select-one [:model/Timeline :name :collection_id] :id id))})

;; Table events - only track published tables in remote-synced collections

(defn- published-table-in-remote-synced-collection?
  "Check if a table is published AND in a remote-synced collection.
   Tables are only considered part of remote sync when they are both published
   and their collection_id points to a remote-synced collection."
  [{:keys [is_published collection_id]}]
  (boolean
   (and is_published
        (collections/remote-synced-collection? collection_id))))

(defn- model-in-published-table-in-remote-synced-collection?
  "Check if a model (field, segment) belongs to a published table in a remote-synced collection.
   The model must have a :table_id that points to a table with :is_published true
   and :collection_id in a remote-synced collection."
  [{:keys [table_id]}]
  (boolean
   (when table_id
     (when-let [table (t2/select-one :model/Table :id table_id)]
       (published-table-in-remote-synced-collection? table)))))

(defmodel-change-handler :table
  {:model-type       "Table"
   :event-prefix     :event/table
   :log-name         "table"
   :archived-key     :archived_at
   :in-sync-pred     published-table-in-remote-synced-collection?
   :hydrate-details  hydrate-table-details})

;; Segment events - track segments in published tables in remote-synced collections

(defn- hydrate-segment-details
  "Hydrates details for a Segment, including parent table info."
  [id]
  (first (t2/query {:select [:s.name :s.table_id [:t.collection_id :collection_id] [:t.name :table_name]]
                    :from [[:segment :s]]
                    :join [[:metabase_table :t] [:= :s.table_id :t.id]]
                    :where [:= :s.id id]})))

(defmodel-change-handler :segment
  {:model-type       "Segment"
   :event-prefix     :event/segment
   :log-name         "segment"
   :in-sync-pred     model-in-published-table-in-remote-synced-collection?
   :hydrate-details  hydrate-segment-details})

;; Field events - track fields in published tables in remote-synced collections

(defn- hydrate-field-details
  "Hydrates details for a Field, including parent table info."
  [id]
  (first (t2/query {:select [:f.name :f.table_id [:t.collection_id :collection_id] [:t.name :table_name]]
                    :from [[:metabase_field :f]]
                    :join [[:metabase_table :t] [:= :f.table_id :t.id]]
                    :where [:= :f.id id]})))

(defmodel-change-handler :field
  {:model-type       "Field"
   :event-prefix     :event/field
   :log-name         "field"
   :in-sync-pred     model-in-published-table-in-remote-synced-collection?
   :hydrate-details  hydrate-field-details})
