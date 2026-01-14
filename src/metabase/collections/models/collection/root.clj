(ns metabase.collections.models.collection.root
  (:require
   [medley.core :as m]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [potemkin.types :as p.types]
   [toucan2.protocols :as t2.protocols]
   [toucan2.tools.hydrate :refer [hydrate]]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   Root Collection Special Placeholder Object                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The Root Collection special placeholder object is used to represent the fact that we're working with the 'Root'
;; Collection in many of the functions in this namespace. The Root Collection is not a true Collection, but instead
;; represents things that have no collection_id, or are otherwise to be seen at the top-level by the current user.

(p.types/defrecord+ RootCollection [])

(doto RootCollection
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

(extend-protocol t2.protocols/IModel
  RootCollection
  (model [_this]
    RootCollection))

(defmethod mi/perms-objects-set RootCollection
  [collection read-or-write]
  {:pre [(map? collection)]}
  ;; HACK Collections in the "snippets" namespace have no-op permissions unless EE snippet collections are enabled
  (if (and (= (u/qualified-name (:namespace collection)) "snippets")
           (not (premium-features/enable-snippet-collections?)))
    #{}
    #{((case read-or-write
         :read  perms/collection-read-path
         :write perms/collection-readwrite-path) collection)}))

(def ^RootCollection root-collection
  "Special placeholder object representing the Root Collection, which isn't really a real Collection."
  (map->RootCollection {::is-root? true, :authority_level nil}))

(defn is-root-collection?
  "Is `x` the special placeholder object representing the Root Collection?"
  [x]
  ;; TODO -- not sure this makes sense because other places we check whether `::is-root?` is present or not.
  (instance? RootCollection x))

(defn root-collection-with-ui-details
  "The special Root Collection placeholder object with some extra details to facilitate displaying it on the FE."
  [collection-namespace]
  (m/assoc-some root-collection
                :name (case (keyword collection-namespace)
                        :shared-tenant-collections (tru "Shared collections")
                        :snippets (tru "SQL snippets")
                        :transforms (tru "Transforms")
                        (tru "Our analytics"))
                :namespace collection-namespace
                :is_personal false
                :id "root"
                ;; Root collection itself is not remote-synced; individual top-level collections
                ;; within the shared-tenant-collection namespace can be toggled individually.
                :is_remote_synced false))

(defn hydrated-root-collection
  "Return the root collection entity for the given namespace.
  By default, returns the root collection for the non-namespaced collection subtree."
  ([]
   (hydrated-root-collection nil))
  ([collection-namespace]
   (-> (root-collection-with-ui-details collection-namespace)
       (hydrate :can_write))))

(defn hydrate-root-collection
  "Hydrate `:collection` onto entity when the id is `nil`."
  ([entity] (hydrate-root-collection entity (hydrated-root-collection)))
  ([{:keys [collection_id] :as entity} root-collection]
   (cond-> entity
     (nil? collection_id) (assoc :collection root-collection))))
