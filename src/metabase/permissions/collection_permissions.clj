(ns metabase.permissions.collection-permissions
  "Collection permissions: what a user may do with Collections, `:read-and-write`, `:read` or `:none`, asked of the
  application database every time, by the rules of the SQL in [[metabase.permissions.db]]:

  - a user has what their groups' Collection permission rows grant;
  - they write their personal Collection and its descendants, their tenant Collections, and, as a data analyst, the
    transforms namespace and its root;
  - a superuser has everything.

  [[collection-permissions-for-user]] is the only way to ask about Collections: it takes many ids and answers them
  together, so a caller checking many rows, such as a batched hydration, gathers their ids and asks once.
  [[some-collection-permission-for-user]] answers for the user as a whole."
  (:require
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.path :as permissions.path]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.permissions.settings :as permissions.settings]
   [metabase.permissions.user :as permissions.user]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private rank->permission
  "The permission each rank of `metabase.permissions.db/collection-ranks` stands for."
  [:none :read :read-and-write])

(defn- permission->rank
  "The rank of `permission`, for comparing permissions."
  [permission]
  (.indexOf ^java.util.List rank->permission permission))

(defn- collection-user
  "The `metabase.permissions.db/collection-user` of the user of `user-info`."
  [{:keys [user-id is-superuser? is-data-analyst?]}]
  (let [user-id? (and user-id (not is-superuser?))]
    {:user-id               user-id
     :is-superuser?         is-superuser?
     :is-data-analyst?      (boolean (and user-id? is-data-analyst?))
     :tenant-collection-ids (if user-id?
                              (vec (permissions.user/user->tenant-collection-and-descendant-ids user-id))
                              [])
     :use-tenants?          (boolean (permissions.settings/use-tenants))}))

(defn- no-user?
  "Whether `user-info` names no user and no superuser context, which has no permissions."
  [{:keys [user-id is-superuser?]}]
  (and (nil? user-id) (not is-superuser?)))

(defn- root-collection-permission
  "The permission of the user of `user-info` on the root Collection of `root-namespace`: a superuser writes every root,
  and a data analyst the transforms one."
  [{:keys [user-id is-superuser? is-data-analyst?] :as user-info} root-namespace]
  (let [root-namespace (some-> root-namespace name)
        root           {:metabase.collections.models.collection.root/is-root? true :namespace root-namespace}]
    (cond
      is-superuser?                                         :read-and-write
      (no-user? user-info)                                  :none
      (and (= root-namespace "transforms") is-data-analyst?) :read-and-write
      :else
      (rank->permission (permissions.db/root-collection-rank user-id
                                                             (permissions.path/collection-readwrite-path root)
                                                             (permissions.path/collection-read-path root))))))

(def ^:private collection-ids-per-query
  "How many Collection ids one permission query asks about: enough for a whole Collection tree to cost a handful of
  queries, and few enough for a database to take as a list."
  10000)

(defn- collection-id->permission
  "The permission of the user of `user-info` on each of the Collections with `collection-ids`, none of them nil."
  [user-info collection-ids]
  (cond
    (empty? collection-ids)
    {}

    (no-user? user-info)
    (zipmap collection-ids (repeat :none))

    :else
    (let [user (collection-user user-info)]
      (into (zipmap collection-ids (repeat :none))
            (comp (mapcat #(permissions.db/collection-ranks user (vec %)))
                  (map (fn [{:keys [id rank]}] [id (rank->permission rank)])))
            (partition-all collection-ids-per-query collection-ids)))))

(mu/defn collection-permissions-for-user :- [:map-of [:maybe ms/PositiveInt] [:enum :read-and-write :read :none]]
  "The permission of the user of `user-info` on each of the Collections with `collection-ids`, as a map with an entry
  for every id asked. A nil id stands for the root Collection of the `:root-namespace` option and is answered under the
  nil key. The Collections cost one query per 10,000 distinct ids, and the root one more when a nil id is asked."
  [user-info                        :- ::permissions.schema/collection-user-info
   collection-ids                   :- [:sequential [:maybe ms/PositiveInt]]
   {root-namespace :root-namespace} :- ::permissions.schema/collection-options]
  (let [ids (into [] (comp (remove nil?) (distinct)) collection-ids)]
    (cond-> (collection-id->permission user-info ids)
      (some nil? collection-ids) (assoc nil (root-collection-permission user-info root-namespace)))))

(mu/defn collection-permission-at-least? :- :boolean
  "Whether `actual`, a Collection permission, is `required` or more."
  [actual   :- [:enum :read-and-write :read :none]
   required :- [:enum :read-and-write :read]]
  (>= (permission->rank actual) (permission->rank required)))

(mu/defn some-collection-permission-for-user :- [:enum :read-and-write :read :none]
  "The best permission the user of `user-info` has on a Collection listed to them: not archived, not the trash and not
  a shared tenant Collection on an instance without tenants."
  [user-info :- ::permissions.schema/collection-user-info]
  (rank->permission (permissions.db/some-collection-rank (collection-user user-info))))
