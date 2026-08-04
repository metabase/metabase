(ns metabase.permissions.path
  (:require
   [clojure.string :as str]
   [metabase.permissions.util :as perms.u]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def MapOrID
  "Schema for a map or an ID (positive integer)."
  [:or :map ms/PositiveInt])

(defn- root-collection?
  "Whether `collection-or-id` stands for the root of a namespace — either the synthesized placeholder record or the
  real `is_root` row that backs it. Both answer to the same permission path, so granting a group the root of a
  namespace keeps working across the switch to real rows."
  [collection-or-id]
  (boolean (or (get collection-or-id :metabase.collections.models.collection.root/is-root?)
               (get collection-or-id :is_root))))

(mu/defn collection-readwrite-path :- perms.u/PathSchema
  "Return the permissions path for *readwrite* access for a `collection-or-id`."
  [collection-or-id :- MapOrID]
  (if-not (root-collection? collection-or-id)
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
  [perm-type]
  (case perm-type
    :setting
    "/application/setting/"

    :monitoring
    "/application/monitoring/"

    :subscription
    "/application/subscription/"))
