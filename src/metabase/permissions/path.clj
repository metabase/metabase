(ns metabase.permissions.path
  (:require
   [metabase.permissions.util :as perms.u]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def MapOrID
  "Schema for a map or an ID (positive integer)."
  [:or :map ms/PositiveInt])

(mu/defn collection-readwrite-path :- perms.u/PathSchema
  "Return the permissions path for *readwrite* access for a `collection-or-id`."
  [collection-or-id :- MapOrID]
  (if-not (get collection-or-id :metabase.collections.models.collection.root/is-root?)
    (format "/collection/%d/" (u/the-id collection-or-id))
    (if-let [collection-namespace (:namespace collection-or-id)]
      (format "/collection/namespace/%s/root/" (perms.u/escape-path-component (u/qualified-name collection-namespace)))
      "/collection/root/")))

(mu/defn collection-read-path :- perms.u/PathSchema
  "Return the permissions path for *read* access for a `collection-or-id`."
  [collection-or-id :- MapOrID]
  (str (collection-readwrite-path collection-or-id) "read/"))

(mu/defn application-perms-path :- perms.u/PathSchema
  "Returns the permissions path for *full* access a application permission."
  [perm-type]
  (case perm-type
    :setting
    "/application/setting/"

    :monitoring
    "/application/monitoring/"

    :subscription
    "/application/subscription/"))
