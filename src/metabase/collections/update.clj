(ns metabase.collections.update
  "Update-collection business logic, shared between the REST endpoint
  (`metabase.collections-rest.api`) and other callers like the MCP `collection_write` tool.
  Lives in the `collections` module so non-REST consumers can use it without crossing the
  module-linter's non-rest -> rest barrier, mirroring `metabase.collections.create`."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.schema :as collections.schema]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   ;; `metabase.notification.card`, not `notification.core`: `core` pulls the payload/send chain,
   ;; which reaches `queries.core` -> `queries.models.card` -> `collections.core` and so cycles
   ;; back into this module. `notification.card` requires only events, the notification models,
   ;; and toucan.
   [metabase.notification.card :as notification.card]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def UpdateCollectionArguments
  "The arguments to an update-collection call — what the public API surface accepts. Absent keys
  are left alone; `:archived` and `:parent_id` are acted on only when present."
  [:map {:closed true}
   [:name            {:optional true} [:maybe ::collections.schema/collection.name]]
   [:description     {:optional true} [:maybe ms/NonBlankString]]
   [:archived        {:optional true} [:maybe :boolean]]
   [:parent_id       {:optional true} [:maybe ms/PositiveInt]]
   [:authority_level {:optional true} [:maybe collection/AuthorityLevel]]])

(defn- stopped-alerts
  "The `[card notifications]` pairs of the Cards in the Collection with `collection-id` that have alerts, which archiving
  the Collection deletes."
  [collection-id]
  (vec (for [card          (collections.db/cards-in-collection collection-id)
             :let          [notifications (seq (notification.card/card-notifications card))]
             :when         notifications]
         [card notifications])))

(defn- delete-stopped-alerts!
  "Deletes the alerts of `stopped`, which archiving a Collection stops: the Cards in it follow its archive, so their
  own hooks leave their alerts."
  [stopped]
  (when-let [notification-ids (seq (for [[_card notifications] stopped, notification notifications] (:id notification)))]
    (collections.db/delete-notifications! (vec notification-ids))))

(defn- notify-stopped-alerts!
  "Tells the recipients of the alerts of `stopped`, which archiving a Collection deleted, as archiving their Card does."
  [stopped actor]
  (doseq [[card notifications] stopped]
    (notification.card/notify-card-notifications-deleted! :card-archived actor card notifications)))

(defn- check-can-restore
  "Throws unless the current user may restore `collection` and what its archive took down, into the Collection that
  `collection-updates` name or else the one it was in, which must not be archived."
  [collection collection-updates]
  (let [parent-id  (if (contains? collection-updates :parent_id)
                     (:parent_id collection-updates)
                     (:parent_id collection))
        new-parent (if parent-id
                     (api/check-404 (collections.db/collection parent-id))
                     (collection/parent-or-root (:namespace collection) nil))]
    (api/check-400 (and (some? new-parent) (not (:archived new-parent))))
    (if (contains? collection-updates :parent_id)
      (api/check-403
       (and (mi/can-write? (t2/hydrate new-parent :can_write))
            (collection/can-write-collection-ids? (vec (collection/collection-ids-for-unarchiving collection)))))
      (api/check-403 (:can_restore (t2/hydrate collection :can_restore))))))

(defn- move-collection!
  "If `collection-updates` specifies that we should *move* a Collection, check that the user can move it and move it
  (and its descendants)."
  [collection-before-update collection-updates]
  (when (contains? collection-updates :parent_id)
    (let [new-parent-id (:parent_id collection-updates)
          new-location  (collection/children-location
                         (collection/parent-or-root (:namespace collection-before-update) new-parent-id))]
      (when (not= (:location collection-before-update) new-location)
        (api/update-check collection-before-update {:parent_id new-parent-id})
        (collection/move-collection! collection-before-update new-location)))))

(defn- archive-or-restore!
  "Archives or restores the Collection, with what follows it, as `collection-updates` ask, checks permissions first, then
  moves it for a restore into another parent."
  [collection-before-update collection-updates]
  (let [id       (u/the-id collection-before-update)
        archive? (boolean (:archived collection-updates))]
    (when-not archive?
      (check-can-restore collection-before-update collection-updates))
    (let [stopped (when archive? (stopped-alerts id))]
      (collections.db/update-collection! id {:archived archive?})
      (delete-stopped-alerts! stopped)
      (when archive?
        (notify-stopped-alerts! stopped @api/*current-user*))
      (when-not archive?
        (move-collection! (collections.db/collection id) collection-updates)))))

(mu/defn update-collection!
  "Applies `collection-updates` to the Collection with `id` after its update check, archiving, restoring or moving it as
  they ask, and returns it."
  [id                 :- ms/PositiveInt
   collection-updates :- UpdateCollectionArguments]
  (let [collection-before-update (t2/hydrate (api/check-404 (collections.db/collection id)) :parent_id)
        updates                  (u/select-keys-when collection-updates :present [:name :description :authority_level])
        archived-change?         (some-> (:archived collection-updates) boolean (not= (boolean (:archived collection-before-update))))]
    (api/update-check collection-before-update
                      (cond-> updates archived-change? (assoc :archived (boolean (:archived collection-updates)))))
    ;; tenant-specific-root-collection collections cannot be updated
    (api/check-400
     (not= (:type collection-before-update) collection/tenant-specific-root-collection-type))
    ;; A transforms folder is deleted, never archived: an archived folder hides transforms that keep running. Check
    ;; before any write, so a refused request changes nothing.
    (api/check-400 (not (and (:archived collection-updates)
                             (= (:namespace collection-before-update) collection/transforms-ns)))
                   (tru "A transforms folder cannot be archived. Delete it instead."))
    ;; if authority_level is changing, make sure we're allowed to do that
    (when (and (contains? collection-updates :authority_level)
               (not= (keyword (:authority_level collection-updates))
                     (:authority_level collection-before-update)))
      (premium-features/assert-has-feature :official-collections (tru "Official Collections"))
      (api/check-403 api/*is-superuser?*))
    (events/with-batched-events
      (when (seq updates)
        (collections.db/update-collection! id updates))
      (if archived-change?
        (archive-or-restore! collection-before-update collection-updates)
        (move-collection! collection-before-update collection-updates)))
    (u/prog1 (collections.db/collection id)
      (events/publish-event! :event/collection-touch {:collection-id id :user-id api/*current-user-id*}))))
