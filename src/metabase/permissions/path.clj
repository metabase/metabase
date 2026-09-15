(ns metabase.permissions.path
  (:require
   [clojure.string :as str]
   [metabase.collections.schema :as collections.schema]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.permissions.util :as perms.u]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::collection-or-root-map
  "The `RootCollection` placeholder object (never a real Toucan instance, so it's enumerated by its known keys
  instead), optionally hydrated with the computed keys the Collection API adds."
  [:map {:closed true}
   [:metabase.collections.models.collection.root/is-root? {:optional true} :boolean]
   [:namespace           {:optional true} [:maybe [:or :keyword :string]]]
   [:name                {:optional true} :string]
   [:is_personal         {:optional true} :boolean]
   [:id                  {:optional true} [:or ms/PositiveInt :string]]
   [:is_remote_synced    {:optional true} :boolean]
   [:authority_level     {:optional true} [:maybe [:or :keyword :string]]]
   [:can_write           {:optional true} :boolean]
   [:can_restore         {:optional true} :boolean]
   [:can_delete          {:optional true} :boolean]
   [:parent_id           {:optional true} [:maybe [:or ms/PositiveInt :string]]]
   [:effective_location  {:optional true} [:maybe :string]]
   [:effective_ancestors {:optional true} [:sequential [:ref ::collection-or-root-map]]]])

(def MapOrID
  "Schema for a Collection or PermissionsGroup, its ID, or the `RootCollection` placeholder object."
  [:or
   ms/PositiveInt
   ::collections.schema/collection
   ::permissions.schema/permissions-group
   ::collection-or-root-map])

(mu/defn collection-readwrite-path :- perms.u/PathSchema
  "Return the permissions path for *readwrite* access for a `collection-or-id`."
  [collection-or-id :- MapOrID]
  (if-not (get collection-or-id :metabase.collections.models.collection.root/is-root?)
    (format "/collection/%d/" (u/the-id collection-or-id))
    (if-let [collection-namespace (:namespace collection-or-id)]
      (format "/collection/namespace/%s/root/" (perms.u/escape-path-component (u/qualified-name collection-namespace)))
      "/collection/root/")))

(mu/defn collection-path?
  "Whether permissions `path` is any type of path for any Collection (1-arity) or for the Collection with
  `collection-id` (2-arity)."
  ([path :- [:maybe perms.u/PathSchema]]
   (str/starts-with? path "/collection/"))

  ([path          :- [:maybe perms.u/PathSchema]
    collection-id :- pos-int?]
   (str/starts-with? path (format "/collection/%d/" collection-id))))

(mu/defn collection-read-path :- perms.u/PathSchema
  "Return the permissions path for *read* access for a `collection-or-id`."
  [collection-or-id :- MapOrID]
  (str (collection-readwrite-path collection-or-id) "read/"))

(mu/defn application-perms-path :- perms.u/PathSchema
  "Returns the permissions path for *full* access a application permission."
  [perm-type :- [:enum :setting :monitoring :subscription]]
  (case perm-type
    :setting
    "/application/setting/"

    :monitoring
    "/application/monitoring/"

    :subscription
    "/application/subscription/"))
