(ns metabase-enterprise.remote-sync.events
  "Event system for remote sync operations and model change tracking.

   Provides event publishing and handling for remote sync operations,
   allowing components to react to remote sync state changes.

   Also tracks changes to models (cards, dashboards, documents, collections)
   that are part of remote-synced collections."
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

(defmulti ^:private remote-sync-model-details
  "Returns a map of relevant fields for the model."
  {:arglists '([model-type model-id])}
  (fn [model-type _model-id] model-type))

(defmethod remote-sync-model-details "Card"
  [_model-type model-id]
  (t2/select-one [:model/Card :name :collection_id :display] :id model-id))

(defmethod remote-sync-model-details "Dashboard"
  [_model-type model-id]
  (t2/select-one [:model/Dashboard :name :collection_id] :id model-id))

(defmethod remote-sync-model-details "Document"
  [_model-type model-id]
  (t2/select-one [:model/Document :name :collection_id] :id model-id))

(defmethod remote-sync-model-details "NativeQuerySnippet"
  [_model-type model-id]
  (t2/select-one [:model/NativeQuerySnippet :name :id] :id model-id))

(defmethod remote-sync-model-details "Timeline"
  [_model-type model-id]
  (t2/select-one [:model/Timeline :name :collection_id] :id model-id))

(defmethod remote-sync-model-details "Collection"
  [_model-type model-id]
  (t2/select-one [:model/Collection :name [:id :collection_id]] :id model-id))

(defn- create-or-update-remote-sync-object-entry!
  "Creates or updates a remote sync object entry for a model change. Takes a model-type (type of model: 'Card',
  'Dashboard', 'Document', 'Collection'), a model-id (ID of the affected model), a status (status of the sync:
  'create', 'update', 'removed', 'delete', 'error', 'synced'), and an optional user-id (ID of the user making
  the change). Returns the created or updated remote sync object entry."
  [model-type model-id status & [_user-id]]
  (let [existing (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id)]
    (cond
      (not existing)
      (let [model-details (remote-sync-model-details model-type model-id)]
        (t2/insert! :model/RemoteSyncObject
                    {:model_type model-type
                     :model_id model-id
                     :model_name (:name model-details)
                     :model_collection_id (:collection_id model-details)
                     :model_display (some-> model-details :display name)
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
      (let [model (remote-sync-model-details model-type model-id)]
        (t2/update! :model/RemoteSyncObject (:id existing)
                    {:status status
                     :status_changed_at (t/offset-date-time)
                     :model_name (:name model)
                     :model_collection_id (:collection_id model)
                     :model_display (some-> model :display name)})))))

;; Model change tracking event handlers

(defmacro ^:private defmodel-change-handler
  "Defines event derivations and handler for a standard model change event.

   Usage:
     (defmodel-change-handler card
       {:model-type   \"Card\"
        :event-prefix :event/card
        :log-name     \"card\"})

   Configuration options:
   - :model-type   - String for RemoteSyncObject model_type (e.g. \"Card\")
   - :event-prefix - Keyword prefix for events (e.g. :event/card)
   - :log-name     - String for log messages (e.g. \"card\")
   - :archived-key - Key to check for archived status (default :archived)
   - :in-sync-pred - Predicate fn (default model-in-remote-synced-collection?)"
  [event-group {:keys [model-type event-prefix log-name archived-key in-sync-pred]
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
         (let [{:keys [~'object ~'user-id]} event#
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
                ~model-type (:id ~'object) status# ~'user-id))

             (and existing-entry# (not in-remote-synced?#))
             (do
               (log/infof "%s %s moved out of remote-synced collection, marking as removed"
                          ~log-name (:id ~'object))
               (create-or-update-remote-sync-object-entry!
                ~model-type (:id ~'object) "removed" ~'user-id))))))))

;; Standard model change handlers

(defmodel-change-handler card
  {:model-type   "Card"
   :event-prefix :event/card
   :log-name     "card"})

(defmodel-change-handler dashboard
  {:model-type   "Dashboard"
   :event-prefix :event/dashboard
   :log-name     "dashboard"})

(defmodel-change-handler document
  {:model-type   "Document"
   :event-prefix :event/document
   :log-name     "document"})

(defmodel-change-handler snippet
  {:model-type   "NativeQuerySnippet"
   :event-prefix :event/snippet
   :log-name     "snippet"})

;; Collection create/update events - derive from common parent for shared handling
(derive ::collection-change-event :metabase/event)
(derive :event/collection-create ::collection-change-event)
(derive :event/collection-update ::collection-change-event)

(defn- track-published-tables-in-collection!
  "When a collection becomes remote-synced, find all published tables in it
   and create 'create' entries for them in RemoteSyncObject (if not already tracked)."
  [collection-id user-id]
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
          (create-or-update-remote-sync-object-entry! "Table" (:id table) "create" user-id))))))

(methodical/defmethod events/publish-event! ::collection-change-event
  [topic event]
  (let [{:keys [object user-id]} event
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
        (create-or-update-remote-sync-object-entry! "Collection" (:id object) status user-id)
        ;; If collection just became remote-synced, track all published tables in it
        (when (not was-remote-synced?)
          (track-published-tables-in-collection! (:id object) user-id)))

      ;; Collection was remote-synced but type changed - mark as removed
      (and existing-entry (not is-remote-synced?))
      (do
        (log/infof "Collection %s type changed from remote-synced, marking as removed" (:id object))
        (create-or-update-remote-sync-object-entry! "Collection" (:id object) "removed" user-id)))))

(defmodel-change-handler timeline
  {:model-type   "Timeline"
   :event-prefix :event/timeline
   :log-name     "timeline"})

;; Table events - only track published tables in remote-synced collections

(defn- published-table-in-remote-synced-collection?
  "Check if a table is published AND in a remote-synced collection.
   Tables are only considered part of remote sync when they are both published
   and their collection_id points to a remote-synced collection."
  [{:keys [is_published collection_id]}]
  (boolean
   (and is_published
        (collections/remote-synced-collection? collection_id))))

(defmodel-change-handler table
  {:model-type   "Table"
   :event-prefix :event/table
   :log-name     "table"
   :archived-key :archived_at
   :in-sync-pred published-table-in-remote-synced-collection?})
