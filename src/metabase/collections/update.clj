(ns metabase.collections.update
  "Update-collection business logic, shared between the REST endpoint
  (`metabase.collections-rest.api`) and other callers like the MCP `collection_write` tool.
  Lives in the `collections` module so non-REST consumers can use it without crossing the
  module-linter's non-rest -> rest barrier, mirroring `metabase.collections.create`."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.notification.core :as notification]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def UpdateCollectionArguments
  "The arguments to an update-collection call — what the public API surface accepts. Absent keys
  are left alone; `:archived` and `:parent_id` are acted on only when present, so a caller that
  wants the REST endpoint's \"omitted means unarchived\" semantics has to supply that default
  itself."
  [:map
   [:name            {:optional true} [:maybe ms/NonBlankString]]
   [:description     {:optional true} [:maybe ms/NonBlankString]]
   [:archived        {:optional true} [:maybe :boolean]]
   [:parent_id       {:optional true} [:maybe ms/PositiveInt]]
   ;; `:type` stays loose here: the exact enum lives in `metabase.collections.children`, which reaches
   ;; `queries` and cycles back to `metabase.collections.core`. The REST endpoint validates it against
   ;; `collections.children/CollectionType` at its own boundary, and it's the only caller that sends one.
   [:type            {:optional true} [:maybe :string]]
   [:authority_level {:optional true} [:maybe collection/AuthorityLevel]]])

(defn- maybe-send-archived-notifications!
  "When a collection is archived, all of it's cards are also marked as archived, but this is down in the model layer
  which will not cause the archive notification code to fire. This will delete the relevant alerts and notify the
  users just as if they had be archived individually via the card API."
  [& {:keys [collection-before-update collection-updates actor]}]
  (when (api/column-will-change? :archived collection-before-update collection-updates)
    (doseq [card (t2/select :model/Card :collection_id (u/the-id collection-before-update))]
      (notification/delete-card-notifications-and-notify! :event/card-update.notification-deleted.card-archived actor card))))

(defn- move-collection!
  "If `collection-updates` specifies that we should *move* a Collection, do appropriate permissions checks and move it
  (and its descendants)."
  [collection-before-update collection-updates]
  ;; sanity check: a [new] parent_id update specified in the request?
  (when (contains? collection-updates :parent_id)
    (let [orig-location (:location collection-before-update)
          new-parent-id (:parent_id collection-updates)
          new-parent    (if new-parent-id
                          (t2/select-one [:model/Collection :location :id :type] :id new-parent-id)
                          collection/root-collection)
          new-location  (collection/children-location new-parent)]
      ;; check and make sure we're actually supposed to be moving something
      (when (not= orig-location new-location)
        ;; Check that we have write perms on the new parent collection
        (api/write-check new-parent)
        ;; ok, make sure we have perms to do this operation
        (api/check-403
         (perms/set-has-full-permissions-for-set? @api/*current-user-permissions-set*
                                                  (collection/perms-for-moving collection-before-update new-parent)))
        (api/check
         (not (collection/shared-tenant-collection? new-parent)))
        ;; ok, we're good to move!
        (collection/move-collection! collection-before-update new-location
                                     (collection/moving-into-remote-synced? (collection/location-path->parent-id orig-location)
                                                                            new-parent-id))))))

(defn- archive-collection!
  "If `collection-updates` specifies that we should archive a collection, do the appropriate permissions checks and
  then move it to the trash."
  [collection-before-update collection-updates]
  ;; sanity check
  (when (api/column-will-change? :archived collection-before-update collection-updates)
    (collection/archive-or-unarchive-collection!
     collection-before-update
     (select-keys collection-updates [:parent_id :archived]))
    (maybe-send-archived-notifications! {:collection-before-update collection-before-update
                                         :collection-updates       collection-updates
                                         :actor                    @api/*current-user*})))

(defn- move-or-archive-collection-if-needed!
  "If `collection-updates` specifies that we should either move or archive the collection (archiving means 'moving to
  the trash' so it makes sense to deal with them together), do the appropriate permissions checks and changes."
  [collection-before-update collection-updates]
  (condp #(api/column-will-change? %1 collection-before-update %2) collection-updates
    :archived (archive-collection! collection-before-update collection-updates)
    :parent_id (move-collection! collection-before-update collection-updates)
    :no-op))

(mu/defn update-collection!
  "Modify the collection with `id`, including archiving or unarchiving it, or moving it. Write-checks the collection,
  gates `authority_level` behind superuser plus the Official Collections feature, applies the plain column updates,
  then moves or archives as `collection-updates` asks, and publishes the update and touch events. Returns the updated
  collection. The single source of truth for collection updates; REST and agent callers both go through here."
  [id                 :- ms/PositiveInt
   collection-updates :- UpdateCollectionArguments]
  ;; do we have perms to edit this Collection?
  (let [collection-before-update (t2/hydrate (api/write-check :model/Collection id) :parent_id)]
    ;; tenant-specific-root-collection collections cannot be updated
    (api/check-400
     (not= (:type collection-before-update) collection/tenant-specific-root-collection-type))
    ;; if authority_level is changing, make sure we're allowed to do that
    (when (and (contains? collection-updates :authority_level)
               (not= (keyword (:authority_level collection-updates))
                     (:authority_level collection-before-update)))
      (premium-features/assert-has-feature :official-collections (tru "Official Collections"))
      (api/check-403 api/*is-superuser?*))
    ;; ok, go ahead and update it! Only update keys that were specified in the request. But not `parent_id` since
    ;; that's not actually a property of Collection, and since we handle moving a Collection separately below.
    (let [updates (u/select-keys-when collection-updates :present [:name :description :authority_level :type])]
      (when (seq updates)
        (t2/update! :model/Collection id updates)))
    ;; if we're trying to move or archive the Collection, go ahead and do that
    (move-or-archive-collection-if-needed! collection-before-update collection-updates)
    (u/prog1 (t2/select-one :model/Collection :id id)
      (events/publish-event! :event/collection-update {:object <> :user-id api/*current-user-id*})
      (events/publish-event! :event/collection-touch {:collection-id id :user-id api/*current-user-id*}))))
