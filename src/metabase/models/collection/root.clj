(ns metabase.models.collection.root
  (:require [metabase.models
             [interface :as i]
             [permissions :as perms]]
            [metabase.util :as u]
            [potemkin.types :as p.types]
            [toucan.models :as models]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   Root Collection Special Placeholder Object                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The Root Collection special placeholder object is used to represent the fact that we're working with the 'Root'
;; Collection in many of the functions in this namespace. The Root Collection is not a true Collection, but instead
;; represents things that have no collection_id, or are otherwise to be seen at the top-level by the current user.

(p.types/defrecord+ RootCollection [])

(u/strict-extend RootCollection
  models/IModel
  (merge
   models/IModelDefaults
   {:types {:type :keyword}})

  i/IObjectPermissions
  (merge
   i/IObjectPermissionsDefaults
   {:perms-objects-set (fn [this read-or-write]
                         #{((case read-or-write
                              :read  perms/collection-read-path
                              :write perms/collection-readwrite-path) this)})
    :can-read?         (partial i/current-user-has-full-permissions? :read)
    :can-write?        (partial i/current-user-has-full-permissions? :write)}))

(def ^RootCollection root-collection
  "Special placeholder object representing the Root Collection, which isn't really a real Collection."
  (map->RootCollection {::is-root? true}))

(defn is-root-collection?
  "Is `x` the special placeholder object representing the Root Collection?"
  [x]
  (instance? RootCollection x))
