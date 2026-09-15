(ns metabase.permissions.path
  (:require
   [clojure.string :as str]
   [metabase.permissions.util :as perms.u]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::collection-or-group-like
  "A Collection, a PermissionsGroup, or any row/hydrated-view/search-result map identifying one (including the
  `RootCollection` placeholder map): deliberately open, since this only reads `:id`, `:namespace`, and the
  RootCollection sentinel key off it."
  [:map {:closed false, ::mr/deliberately-open true}])

(def MapOrID
  "Schema for a Collection or PermissionsGroup, its ID, or the `RootCollection` placeholder object."
  [:or
   ms/PositiveInt
   ::collection-or-group-like])

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
