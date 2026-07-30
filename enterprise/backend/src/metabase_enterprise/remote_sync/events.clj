(ns metabase-enterprise.remote-sync.events
  "Event handlers for tracking model changes in remote-synced collections.

   Listens to Metabase model events (create/update/delete) and maintains the
   RemoteSyncObject table with the current sync status of each tracked model.
   This enables the remote sync system to know which objects have changed
   since the last sync operation.

   Event handlers are registered using specs from `metabase-enterprise.remote-sync.spec`.
   Each spec defines eligibility checking, field hydration, and other configuration.

   Tracked model types:
   - Card, Dashboard, Document, NativeQuerySnippet, Timeline, Collection
   - Table (when published in a remote-synced collection)
   - Field, Segment (when belonging to a published table in a remote-synced collection)
   - Transform, TransformTag, transforms-namespace Collections (when remote-sync-transforms setting is enabled)
   - NativeQuerySnippet, snippets-namespace Collections (when Library is remote-synced)"
  (:require
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.collections.core :as collections]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(defn enable-snippet-tracking!
  "Mark all existing snippets and snippets-namespace collections as 'create' for initial sync."
  []
  (let [timestamp (t/offset-date-time)
        rows      (concat
                   (for [coll (t2/select [:model/Collection :id :name] :namespace "snippets")]
                     {:model_type        "Collection"
                      :model_id          (:id coll)
                      :model_name        (:name coll)
                      :status            "create"
                      :status_changed_at timestamp})
                   (for [snippet (t2/select [:model/NativeQuerySnippet :id :name :collection_id])]
                     {:model_type          "NativeQuerySnippet"
                      :model_id            (:id snippet)
                      :model_name          (:name snippet)
                      :model_collection_id (:collection_id snippet)
                      :status              "create"
                      :status_changed_at   timestamp}))]
    (when (seq rows)
      (t2/insert! :model/RemoteSyncObject rows))))

(defn disable-snippet-tracking!
  "Remove all snippet-related tracking entries."
  []
  (let [snippet-coll-ids (t2/select-pks-set :model/Collection :namespace "snippets")]
    (t2/delete! :model/RemoteSyncObject
                :model_type "NativeQuerySnippet")
    (when (seq snippet-coll-ids)
      (t2/delete! :model/RemoteSyncObject
                  :model_type "Collection"
                  :model_id [:in snippet-coll-ids]))))

;;; ----------------------------------------- Helper Functions ---------------------------------------------------------

(defn- resolve-status
  "Suppresses a no-op 'update' based on status and content_hash, otherwise keep status unchanged."
  [model-type model-id status existing]
  (cond
    (not= "update" status)
    status

    (nil? (:content_hash existing))
    status

    (not= (:content_hash existing)
          (source/row->content-hash {:model_type model-type :model_id model-id}))
    status

    :else ;; hash has not changed
    "synced"))

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
      (and (= "create" (:status existing)) (contains? #{"removed" "delete"} status))
      (t2/delete! :model/RemoteSyncObject (:id existing))
      (= "delete" (:status existing))
      (t2/update! :model/RemoteSyncObject (:id existing)
                  {:status status
                   :status_changed_at (t/offset-date-time)})
      (not (= "create" (:status existing)))
      (let [model-details (hydrate-details-fn model-id)]
        (t2/update! :model/RemoteSyncObject (:id existing)
                    {:status (resolve-status model-type model-id status existing)
                     :status_changed_at (t/offset-date-time)
                     :model_name (:name model-details)
                     :model_collection_id (:collection_id model-details)
                     :model_display (some-> model-details :display name)
                     :model_table_id (:table_id model-details)
                     :model_table_name (:table_name model-details)})))))

;;; ----------------------------------------- Spec-based Event Handling ------------------------------------------------

(defn- still-eligible?
  "Re-checks `model-id`'s eligibility against current DB state. The eligibility that got us here was computed
   from an event payload, which a concurrent change may have invalidated in the meantime."
  [model-spec model-id]
  (boolean (when-let [instance (t2/select-one (:model-key model-spec) :id model-id)]
             (spec/check-eligibility model-spec instance))))

(defn- create-or-update-sync-object-from-spec!
  "Creates or updates a RemoteSyncObject entry using a spec for field hydration.
   This is the spec-based version of create-or-update-remote-sync-object-entry!.

   Row-locks the entry for the transaction, so this and a concurrent un-sync of the entity's collection
   settle in a fixed order rather than losing one of the two writes: whichever locks first commits, and
   the other then observes that result — the un-sync re-marking the row, or the eligibility re-check below
   seeing the entity is gone from the synced set."
  [model-spec model-id status]
  (t2/with-transaction [_conn]
    (let [model-type (:model-type model-spec)
          existing   (t2/select-one :model/RemoteSyncObject
                                    {:where [:and [:= :model_type model-type] [:= :model_id model-id]]
                                     :for   :update})]
      (cond
        ;; No row to lock, so a concurrent un-sync that hasn't inserted yet is invisible here (a phantom the
        ;; row lock can't cover). Re-check eligibility so a stale tracked-status event does not start tracking
        ;; an entity that has since left the synced set. This narrows, but cannot fully close, that window.
        (and (not existing)
             (not (contains? #{"removed" "delete"} status))
             (not (still-eligible? model-spec model-id)))
        nil

        (not existing)
        (let [model-details (spec/hydrate-model-details model-spec model-id)
              fields        (spec/build-sync-object-fields model-spec model-details)]
          (t2/insert! :model/RemoteSyncObject
                      (merge {:model_type        model-type
                              :model_id          model-id
                              :status            status
                              :status_changed_at (t/offset-date-time)}
                             fields)))

        (and (= "create" (:status existing)) (contains? #{"removed" "delete"} status))
        (t2/delete! :model/RemoteSyncObject (:id existing))

        ;; A pending removal must not be resurrected by a tracked-status write whose eligibility check was
        ;; overtaken by a concurrent un-sync: that check ran against the event payload, well before this
        ;; write, so re-check against current state and let the removal stand when it no longer holds.
        (and (contains? #{"removed" "delete"} (:status existing))
             (not (contains? #{"removed" "delete"} status))
             (not (still-eligible? model-spec model-id)))
        nil

        (= "delete" (:status existing))
        (t2/update! :model/RemoteSyncObject (:id existing)
                    {:status            status
                     :status_changed_at (t/offset-date-time)})

        (not= "create" (:status existing))
        (let [model-details (spec/hydrate-model-details model-spec model-id)
              fields        (spec/build-sync-object-fields model-spec model-details)]
          (t2/update! :model/RemoteSyncObject (:id existing)
                      (merge {:status            (resolve-status model-type model-id status existing)
                              :status_changed_at (t/offset-date-time)}
                             fields)))))))

(defn- cascade-filter
  "Derives the filter conditions for querying eligible children from a child spec."
  [child-spec]
  (or (:cascade-filter child-spec)
      (when-let [ak (:archived-key child-spec)]
        {ak false})))

(defn- cascade-to-children!
  "When a parent model becomes eligible/ineligible, cascade to its children.
   For eligible: query child entities using :parent-fk and derived filter, check eligibility, create RSOs.
   For ineligible: query existing RSOs by model_table_id and mark as removed."
  [model-spec model-id status eligible?]
  (doseq [child-spec (spec/children-specs (:model-key model-spec))]
    (let [fk     (:parent-fk child-spec)
          filter (cascade-filter child-spec)]
      (if eligible?
        ;; Eligible branch: query actual entities and create RSOs for eligible children
        (doseq [child (apply t2/select (:model-key child-spec) (into [fk model-id] cat filter))]
          (when (spec/check-eligibility child-spec child)
            (create-or-update-sync-object-from-spec! child-spec (:id child) status)))
        ;; Ineligible branch: mark existing child RSOs as removed
        (doseq [child-rso (t2/select :model/RemoteSyncObject
                                     :model_type (:model-type child-spec)
                                     :model_table_id model-id
                                     :status [:not-in ["removed" "delete"]])]
          (create-or-update-sync-object-from-spec! child-spec (:model_id child-rso) "removed"))))))

(defn- handle-model-event-from-spec
  "Generic event handler that uses a spec for all configuration.
   Checks eligibility, determines status, and creates/updates the sync object."
  [model-spec topic {:keys [object]}]
  (let [model-type     (:model-type model-spec)
        model-id       (:id object)
        eligible?      (spec/check-eligibility model-spec object)
        existing-entry (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id)
        status         (spec/determine-status model-spec topic object)]
    (cond
      eligible?
      (do
        (log/infof "Creating remote sync object entry for %s %s (status: %s)"
                   model-type model-id status)
        (create-or-update-sync-object-from-spec! model-spec model-id status)
        (when (seq (spec/children-specs (:model-key model-spec)))
          (cascade-to-children! model-spec model-id status true)))
      (and existing-entry (not eligible?))
      (do
        (log/infof "%s %s moved out of sync scope, marking as removed" model-type model-id)
        (create-or-update-sync-object-from-spec! model-spec model-id "removed")
        (when (seq (spec/children-specs (:model-key model-spec)))
          (cascade-to-children! model-spec model-id "removed" false))))))

(defn- register-events-for-spec!
  "Registers event handlers for a single spec. Creates event hierarchy and
   registers a methodical handler for the parent event."
  [model-spec]
  (let [event-kws (spec/event-keywords model-spec)
        parent-kw (:parent event-kws)]
    (derive parent-kw :metabase/event)
    (doseq [[_event-type event-kw] (dissoc event-kws :parent)]
      (derive event-kw parent-kw))
    (methodical/add-primary-method!
     #'events/publish-event!
     parent-kw
     (fn [topic event]
       (handle-model-event-from-spec model-spec topic event)))))

;;; --------------------------------- Spec-based Event Registration (Non-Collection) -----------------------------------

(doseq [[_model-key model-spec] (dissoc spec/remote-sync-specs :model/Collection :model/Field)]
  (register-events-for-spec! model-spec))

;;; ----------------------------------------- Collection Event Handler -------------------------------------------------
;; Collection has special handling due to side effects (tracking published tables when
;; a collection becomes remote-synced). This handler is kept separate from the standard
;; spec-based registration.

(derive ::collection-change-event :metabase/event)
(derive :event/collection-create ::collection-change-event)
(derive :event/collection-update ::collection-change-event)

(defn- hydrate-collection-details
  "Hydrates details for a Collection."
  [id]
  (t2/select-one [:model/Collection :name [:id :collection_id]] :id id))

(defn- handle-library-sync-status-change!
  "When the Library collection's is_remote_synced status changes, trigger snippet sync tracking.
   This ensures all snippets are tracked/untracked when Library sync is enabled/disabled."
  [is-now-synced?]
  (let [snippets-already-tracked? (t2/exists? :model/RemoteSyncObject :model_type "NativeQuerySnippet")]
    (cond
      (and is-now-synced? (not snippets-already-tracked?))
      (do
        (log/info "Library collection became remote-synced, enabling snippet sync tracking")
        (enable-snippet-tracking!))
      (and (not is-now-synced?) snippets-already-tracked?)
      (do
        (log/info "Library collection is no longer remote-synced, disabling snippet sync tracking")
        (disable-snippet-tracking!)))))

(methodical/defmethod events/publish-event! ::collection-change-event
  [topic event]
  (let [{:keys [object]} event
        should-sync? (spec/should-sync-collection? object)
        is-remote-synced? (collections/remote-synced-collection? object)
        existing-entry (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id (:id object))
        status (if (:archived object)
                 "delete"
                 (case topic
                   :event/collection-create "create"
                   :event/collection-update "update"))]
    (when (and (= topic :event/collection-update)
               (spec/library-collection? object))
      (handle-library-sync-status-change! is-remote-synced?))
    (cond
      should-sync?
      (do
        (log/infof "Creating remote sync object entry for collection %s (status: %s)" (:id object) status)
        (create-or-update-remote-sync-object-entry! "Collection" (:id object) status hydrate-collection-details))
      (and existing-entry (not should-sync?))
      (do
        (log/infof "Collection %s no longer needs syncing, marking as removed" (:id object))
        (create-or-update-remote-sync-object-entry! "Collection" (:id object) "removed" hydrate-collection-details)))))

;;; ----------------------------------------- FieldUserSettings Tracking -----------------------------------------------
;; When a field is updated in a published table, also track any FieldUserSettings row for that field.
;; FieldUserSettings has no separate event; it piggybacks on :event/field-update.

(def ^:private field-spec (get spec/remote-sync-specs :model/Field))

(derive :event/field-update ::field-update-event)
(derive ::field-update-event :metabase/event)

(methodical/defmethod events/publish-event! ::field-update-event
  [_topic {:keys [object]}]
  (let [field-id  (:id object)
        eligible? (spec/check-eligibility field-spec object)]
    (cond
      (and eligible? (t2/exists? :model/FieldUserSettings :field_id field-id))
      (create-or-update-remote-sync-object-entry!
       "FieldUserSettings" field-id "update"
       (fn [id] (spec/hydrate-model-details field-spec id)))

      (and (not eligible?)
           (t2/exists? :model/RemoteSyncObject :model_type "FieldUserSettings" :model_id field-id))
      (create-or-update-remote-sync-object-entry!
       "FieldUserSettings" field-id "removed"
       (fn [id] (spec/hydrate-model-details field-spec id))))))
