(ns metabase.permissions.collection-permissions
  "Collection permissions: the request-cached getters answering what a user may do with Collections, `:read-and-write`,
  `:read` or `:none`, from their groups' permission rows plus the Collections they hold anyway (see
  `metabase.permissions.db/own-collection-clause`)."
  (:require
   [metabase.api.common :as api]
   [metabase.permissions.cache :as perms.cache]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.path :as permissions.path]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.permissions.settings :as permissions.settings]
   [metabase.permissions.user :as permissions.user]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private rank->permission
  "The permission each rank of `metabase.permissions.db/collection-rank-case` stands for."
  [:none :read :read-and-write])

(defn- permission->rank
  "The rank of `permission`, for comparing permissions."
  [permission]
  (.indexOf ^java.util.List rank->permission permission))

(defn- use-cache?
  "Whether answers for `user-id` go through the request cache, which holds the current user's only."
  [user-id]
  (and data-perms/*use-perms-cache?*
       (= user-id api/*current-user-id*)))

(defn- grants
  "What the user with `user-id` holds on Collections beyond their groups' permission rows."
  [user-id]
  {:user-id               user-id
   :superuser?            (boolean (data-perms/is-superuser? user-id))
   :data-analyst?         (boolean (data-perms/is-data-analyst? user-id))
   :tenant-collection-ids (if user-id
                            (vec (permissions.user/user->tenant-collection-and-descendant-ids user-id))
                            [])})

(defn- collection-permissions
  "The permission of the user with `user-id` on each of the Collections with `collection-ids`, as `{id permission}`."
  [user-id collection-ids]
  (let [grants (grants user-id)]
    (into {}
          (comp (mapcat #(permissions.db/collection-permission-ranks grants (vec %)))
                (map (fn [{:keys [id rank]}] [id (rank->permission rank)])))
          (partition-all 1000 collection-ids))))

(defn- root-collection-permission
  "The permission of the User with `user-id` on the root Collection of `root-namespace`: a superuser writes every
  root, and a data analyst the transforms one."
  [user-id root-namespace]
  (let [root-namespace (some-> root-namespace name)
        root                 {:metabase.collections.models.collection.root/is-root? true
                              :namespace                                           root-namespace}
        compute              #(rank->permission
                               (permissions.db/root-collection-rank user-id
                                                                    (permissions.path/collection-readwrite-path root)
                                                                    (permissions.path/collection-read-path root)))]
    (cond
      (data-perms/is-superuser? user-id)
      :read-and-write

      (and (= root-namespace "transforms") (data-perms/is-data-analyst? user-id))
      :read-and-write

      (use-cache? user-id)
      (perms.cache/cached [::root-collection root-namespace] compute)

      :else
      (compute))))

(defn clear-cache!
  "Forget the Collection permissions the request cache holds, after a change to them."
  []
  (when-let [cache perms.cache/*cache*]
    (swap! cache dissoc ::collection ::root-collection ::some-collection))
  nil)

(mu/defn collection-permission-for-user :- [:enum :read-and-write :read :none]
  "The permission of the User with `user-id` on the Collection with `collection-id`, batched for the current user with
  the Collections the request loaded, or, for a nil `collection-id`, on the root Collection of the
  `:root-namespace` option."
  [user-id                          :- [:maybe ms/PositiveInt]
   collection-id                    :- [:maybe ms/PositiveInt]
   {root-namespace :root-namespace} :- ::permissions.schema/collection-options]
  (cond
    ;; without a user only a superuser context, such as `request/as-admin`, has permissions
    (and (nil? user-id) (not (data-perms/is-superuser? user-id)))
    :none

    (nil? collection-id)
    (root-collection-permission user-id root-namespace)

    :else
    (let [compute #(collection-permissions user-id %)]
      (or (if (use-cache? user-id)
            (perms.cache/cached-batch [::collection] :model/Collection collection-id compute)
            (get (compute [collection-id]) collection-id))
          :none))))

(mu/defn user-has-permission-for-collection? :- :boolean
  "Whether [[collection-permission-for-user]] is `permission` or more."
  [user-id       :- [:maybe ms/PositiveInt]
   permission    :- [:enum :read-and-write :read]
   collection-id :- [:maybe ms/PositiveInt]
   options       :- ::permissions.schema/collection-options]
  (>= (permission->rank (collection-permission-for-user user-id collection-id options))
      (permission->rank permission)))

(mu/defn some-collection-permission-for-user :- [:enum :read-and-write :read :none]
  "The best permission the User with `user-id` has on a Collection listed to them: not archived, not the trash and not a
  shared tenant Collection on an instance without tenants."
  [user-id :- ms/PositiveInt]
  (let [compute #(rank->permission (permissions.db/best-visible-collection-rank (grants user-id)
                                                                                (boolean (permissions.settings/use-tenants))))]
    (if (use-cache? user-id)
      (perms.cache/cached [::some-collection] compute)
      (compute))))

(mu/defn collection-permission-filter-clause :- [:fn vector?]
  "A HoneySQL where-clause holding when `collection-id-field`, qualified by its table, is a Collection listed to the
  User with `user-id` on which they have `permission`, or nil when they have it on the root Collection of the
  `:root-namespace` option. It checks each row's Collection on its own, so a query asking whether some such row exists
  stops at the first one."
  [user-id             :- ms/PositiveInt
   collection-id-field :- :keyword
   permission          :- [:enum :read-and-write :read]
   options             :- ::permissions.schema/collection-options]
  (permissions.db/visible-collection-filter-clause
   (grants user-id)
   (boolean (permissions.settings/use-tenants))
   collection-id-field
   permission
   (user-has-permission-for-collection? user-id permission nil options)))
