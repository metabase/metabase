(ns metabase-enterprise.remote-sync.events
  "Event system for library synchronization operations and model change tracking.

   Provides event publishing and handling for library sync operations,
   allowing components to react to library state changes.

   Also tracks changes to models (cards, dashboards, documents, collections)
   that are part of library collections."
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; Define our base event type that derives from the core :metabase/event
(derive ::library-sync-event :metabase/event)

;; Define the specific library-sync event type
(derive :event/library-sync ::library-sync-event)

(defn- log-sync-event!
  "Log a sync event to the library_sync_log table.

   Args:
       event (map): Event data map containing sync information.
           sync-type (str): Type of sync operation performed.
           status (str): Status of the sync operation.
           source-branch (str, optional): Source branch name.
           target-branch (str, optional): Target branch name.
           message (str, optional): Optional message or error details."
  [{:keys [sync-type status source-branch target-branch message]}]
  (t2/insert! :model/LibraryChangeLog
              {:sync_type sync-type
               :source_branch source-branch
               :target_branch target-branch
               :status status
               :message message}))

(defn publish-library-sync!
  "Publish a library sync event with the given sync data.

   Args:
       sync-type (keyword/str): Type of sync (:initial, :incremental, :full, \"import\", \"export\").
       library-id (int, optional): ID of the library being synced. Optional for import/export operations.
       user-id (int, optional): ID of the user triggering the sync.
       metadata (map, optional): Additional sync metadata. Can include :branch, :status, :message.

   Returns:
       map: The published event data.

   Examples:
       (publish-library-sync! \"import\" nil 456 {:branch \"main\" :status \"success\"})
       (publish-library-sync! \"export\" nil 456 {:branch \"feature-branch\" :status \"error\" :message \"Network timeout\"})"
  [sync-type library-id user-id & [metadata]]
  (events/publish-event! :event/library-sync
                         (merge {:sync-type sync-type
                                 :library-id library-id
                                 :user-id user-id
                                 :timestamp (t/instant)}
                                metadata)))

;; Event handler for all library sync events
(methodical/defmethod events/publish-event! ::library-sync-event
  [topic event]
  (log-sync-event! event)
  (log/infof "Library sync event: %s - Library %s (sync-type: %s, user: %s)"
             topic
             (:library-id event)
             (:sync-type event)
             (:user-id event)))

 ;; Helper functions for model change tracking

(defn- model-in-library-collection?
  "Check if a model (card, dashboard, document) is in a library collection.

   Args:
       model (map): The model instance with collection_id field.
           collection_id (int): ID of the collection containing the model.

   Returns:
       bool: True if the model is in a library collection, false otherwise."
  [{:keys [collection_id]}]
  (boolean
   (collections/library-collection? collection_id)))

(defn- create-library-change-log-entry!
  "Create a library change log entry for a model change.

   Args:
       model-type (str): Type of model ('card', 'dashboard', 'document', 'collection').
       model-entity-id (int): ID of the affected entity.
       sync-type (str): Type of change ('create', 'update', 'delete', 'touch').
       user-id (int, optional): ID of the user making the change. Defaults to current user.

   Returns:
       map: The created change log entry."
  [model-type model-entity-id sync-type & [user-id]]
  (let [user-id (or user-id api/*current-user-id*)]
    (t2/insert! :model/LibraryChangeLog
                {:model_type model-type
                 :model_entity_id (str model-entity-id)
                 :sync_type sync-type
                 :source_branch nil
                 :target_branch nil
                 :status "success"
                 :message (format "%s %s by user %s" (name sync-type) model-type user-id)})))

;; Model change tracking event handlers

;; Card events
(derive ::card-change-event :metabase/event)
(derive :event/card-create ::card-change-event)
(derive :event/card-update ::card-change-event)
(derive :event/card-delete ::card-change-event)

(methodical/defmethod events/publish-event! ::card-change-event
  [topic event]
  (let [{:keys [object user-id]} event
        sync-type (case topic
                    :event/card-create "create"
                    :event/card-update "update"
                    :event/card-delete "delete")]
    (when (model-in-library-collection? object)
      (log/infof "Creating library change log entry for card %s (action: %s)" (:id object) sync-type)
      (create-library-change-log-entry! "card" (:id object) sync-type user-id))))

;; Dashboard events
(derive ::dashboard-change-event :metabase/event)
(derive :event/dashboard-create ::dashboard-change-event)
(derive :event/dashboard-update ::dashboard-change-event)
(derive :event/dashboard-delete ::dashboard-change-event)

(methodical/defmethod events/publish-event! ::dashboard-change-event
  [topic event]
  (let [{:keys [object user-id]} event
        sync-type (case topic
                    :event/dashboard-create "create"
                    :event/dashboard-update "update"
                    :event/dashboard-delete "delete")]
    (when (model-in-library-collection? object)
      (log/infof "Creating library change log entry for dashboard %s (action: %s)" (:id object) sync-type)
      (create-library-change-log-entry! "dashboard" (:id object) sync-type user-id))))

;; Document events
(derive ::document-change-event :metabase/event)
(derive :event/document-create ::document-change-event)
(derive :event/document-update ::document-change-event)
(derive :event/document-delete ::document-change-event)

(methodical/defmethod events/publish-event! ::document-change-event
  [topic event]
  (let [{:keys [object user-id]} event
        sync-type (case topic
                    :event/document-create "create"
                    :event/document-update "update"
                    :event/document-delete "delete")]
    (when (model-in-library-collection? object)
      (log/infof "Creating library change log entry for document %s (action: %s)" (:id object) sync-type)
      (create-library-change-log-entry! "document" (:id object) sync-type user-id))))

;; Collection touch events
(derive ::collection-touch-event :metabase/event)
(derive :event/collection-touch ::collection-touch-event)

(methodical/defmethod events/publish-event! ::collection-touch-event
  [topic event]
  (let [{:keys [object user-id]} event]
    (when (collections/library-collection? object)
      (log/infof "Creating library change log entry for collection touch %s" (:id object))
      (create-library-change-log-entry! "collection" (:id object) "touch" user-id))))
