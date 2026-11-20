(ns metabase.collections.write
  "The writes of Collections the product makes for its users: creating, updating (renaming, archiving, restoring,
  moving), deleting, and the Library and remote-sync writes, shared by the REST endpoints, the Agent API and the MCP
  tools."
  (:require
   [malli.util]
   [metabase.api.common :as api]
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.schema :as collections.schema]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   ;; `metabase.notification.card`, not `notification.core`: `core` pulls the payload/send chain,
   ;; which reaches `queries.core` -> `queries.models.card` -> `collections.core` and so cycles
   ;; back into this module. `notification.card` requires only events, the notification models,
   ;; and toucan.
   [metabase.notification.card :as notification.card]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn move-collection!
  "Move a Collection and all its descendant Collections from its current `location` to a `new-location`."
  [collection :- collection/CollectionWithLocationAndIDOrRoot
   new-location :- collection/LocationPath]
  (let [orig-children-location (collection/children-location collection)
        new-children-location  (collection/children-location (assoc collection :location new-location))]
    (when (= (:type collection) collection/tenant-specific-root-collection-type)
      (throw (ex-info "Can't move a tenant collection" {:status-code 400})))
    (log/infof "Moving Collection %s and its descendants from %s to %s"
               (u/the-id collection) (:location collection) new-location)
    (events/publish-event! :event/collection-touch {:collection-id (:id collection) :user-id api/*current-user-id*})
    (t2/with-transaction [_conn]
      (collections.db/update-collection! (u/the-id collection) {:location new-location})
      (collections.db/move-descendant-collections! orig-children-location
                                                   new-children-location
                                                   (boolean (collections.db/collection-remote-synced? (u/the-id collection)))))))

(defn- write-check-authority-level
  "Check that a superuser is creating this collection if they are setting the authority level."
  [{authority-level :authority_level :as coll}]
  (when (some? authority-level)
    ;; make sure only admin and an EE token is present to be able to create an Official token
    (premium-features/assert-has-feature :official-collections (tru "Official Collections"))
    (api/check-superuser))
  coll)

(def ^:private CreateCollectionArguments
  "The arguments to a create-collection call — what the public API surface accepts."
  [:map {:closed true}
   [:name            ms/NonBlankString]
   [:description     {:optional true} [:maybe ms/NonBlankString]]
   [:parent_id       {:optional true} [:maybe ms/PositiveInt]]
   [:namespace       {:optional true} [:maybe ms/NonBlankString]]
   [:authority_level {:optional true} [:maybe collection/AuthorityLevel]]])

(def ^:private NewCollectionArguments
  "What we use internally to actually create a collection — what `t2/insert!` needs."
  (-> CreateCollectionArguments
      (malli.util/dissoc :parent_id)
      (malli.util/assoc :location [:maybe ms/NonBlankString])
      (malli.util/assoc :namespace [:maybe [:or :keyword ms/NonBlankString]])
      (malli.util/optional-keys [:location])
      (malli.util/closed-schema)))

(mu/defn apply-defaults-to-collection :- NewCollectionArguments
  "Converts `CreateCollectionArguments` into `NewCollectionArguments`, which locates the collection in its parent."
  [coll-data :- CreateCollectionArguments]
  (let [{:keys [parent_id]} coll-data]
    (-> coll-data
        (assoc :location (collection/children-location (collection/parent-or-root (:namespace coll-data) parent_id)))
        (select-keys (malli.util/keys NewCollectionArguments)))))

(mu/defn create-collection!
  "Creates a Collection after its create check and publishes its touch event."
  [coll-data :- CreateCollectionArguments]
  (api/create-check :model/Collection coll-data)
  (u/prog1 (collections.db/insert-collection!
            (->> (-> (apply-defaults-to-collection coll-data)
                     write-check-authority-level)
                 (lib/normalize ::collections.schema/collection.update)))
    (events/publish-event! :event/collection-touch {:collection-id (:id <>) :user-id api/*current-user-id*})))

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

(defn- move-by-updates!
  "If `collection-updates` specifies that we should *move* a Collection, check that the user can move it and move it
  (and its descendants)."
  [collection-before-update collection-updates]
  (when (contains? collection-updates :parent_id)
    (let [new-parent-id (:parent_id collection-updates)
          new-location  (collection/children-location
                         (collection/parent-or-root (:namespace collection-before-update) new-parent-id))]
      (when (not= (:location collection-before-update) new-location)
        (api/update-check collection-before-update {:parent_id new-parent-id})
        (move-collection! collection-before-update new-location)))))

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
        (move-by-updates! (collections.db/collection id) collection-updates)))))

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
    ;; if authority_level is changing, make sure we're allowed to do that
    (when (and (contains? collection-updates :authority_level)
               (not= (keyword (:authority_level collection-updates))
                     (:authority_level collection-before-update)))
      (premium-features/assert-has-feature :official-collections (tru "Official Collections"))
      (api/check-403 api/*is-superuser?*))
    (events/with-batched-events
      (t2/with-transaction [_conn]
        (when (seq updates)
          (collections.db/update-collection! id updates))
        (if archived-change?
          (archive-or-restore! collection-before-update collection-updates)
          (move-by-updates! collection-before-update collection-updates))))
    (u/prog1 (collections.db/collection id)
      (events/publish-event! :event/collection-touch {:collection-id id :user-id api/*current-user-id*}))))

(defn delete-collection!
  "Deletes the trashed Collection with `id` for a superuser, after moving the Collections that were archived directly out
  of it, and returns the number of Collections deleted."
  [id]
  (api/check-403 api/*is-superuser?*)
  (let [collection (collections.db/collection id)
        old-children-location (collection/children-location collection)
        new-children-location (:location collection)]
    (api/check-400 (:archived collection)
                   "Collection must be trashed before deletion.")
    (api/check-400 (contains? #{:tenant-specific collection/shared-tenant-ns nil} (:namespace collection))
                   "Only collections in the default or tenant namespaces can be deleted.")
    (api/check-400 (nil? (:personal_owner_id collection))
                   "Personal collections cannot be deleted.")
    (events/with-batched-events
      (doseq [child (collections.db/directly-archived-descendant-collections old-children-location)]
        (move-collection! child new-children-location))
      (collections.db/delete-collection! id))))

(defn- set-remote-synced-by-depth!
  "Set `:is_remote_synced` to `remote-synced?` on `collections`, a parent in a statement before its children, since the
  update hook of each checks the flag of its stored parent."
  [collections remote-synced?]
  (t2/with-transaction [_conn]
    (doseq [[_depth level] (sort-by key (group-by #(count (filter #{\/} (:location %))) collections))]
      (collections.db/set-collections-remote-synced! (mapv :id level) remote-synced?))))

(defn clear-remote-synced-collection!
  "Marks any remote-synced-collection as non-remote-synced"
  []
  (set-remote-synced-by-depth! (collections.db/remote-synced-collection-locations) false))

(defn set-remote-synced!
  "Marks `collection` and its descendants as remote-synced, or as not remote-synced when `remote-synced?` is false."
  [collection remote-synced?]
  (set-remote-synced-by-depth! (collections.db/subtree-locations-to-flag (:id collection)
                                                                         (collection/children-location collection)
                                                                         remote-synced?)
                               remote-synced?))

(defn- grant-library-collection-permissions!
  "Gives All Users read and Data Analysts read-write access to the Library `collection`."
  [collection]
  (collections.db/delete-permissions-for-collection! (:id collection))
  (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
  (perms/grant-collection-readwrite-permissions! (perms/data-analyst-group) collection))

(defn create-library-collection!
  "Create the Library collection. Returns Created collection. Throws if it already exists."
  []
  (let [library       (collections.db/insert-collection! {:name      "Library"
                                                          :type      collection/library-collection-type
                                                          :location  "/"
                                                          :entity_id collection/library-entity-id})
        base-location (str "/" (:id library) "/")
        data          (collections.db/insert-collection! {:name      "Data"
                                                          :type      collection/library-data-collection-type
                                                          :location  base-location
                                                          :entity_id collection/library-data-entity-id})
        metrics       (collections.db/insert-collection! {:name      "Metrics"
                                                          :type      collection/library-metrics-collection-type
                                                          :location  base-location
                                                          :entity_id collection/library-metrics-entity-id})]
    (run! grant-library-collection-permissions! [library data metrics])
    library))
