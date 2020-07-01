(ns metabase.models.native-query-snippet
  (:require [metabase.models
             [collection :as collection :refer [Collection]]
             [interface :as i]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [models :as models]]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel NativeQuerySnippet :native_query_snippet)

(defmethod collection/allowed-namespaces (class NativeQuerySnippet)
  [_]
  #{:snippets})

(defn- pre-insert [snippet]
  (u/prog1 snippet
    (collection/check-collection-namespace snippet)))

(defn- pre-update [{:keys [creator_id id], :as updates}]
  (u/prog1 updates
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? updates :creator_id)
      (when (not= creator_id (db/select-one-field :creator_id NativeQuerySnippet :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a NativeQuerySnippet.")))))
    (collection/check-collection-namespace updates)))

(defn- can-read-parent-collection?
  ([{collection-id :collection-id}]
   (or (not collection-id)
       (i/can-read? Collection collection-id)))

  ([_ snippet-id]
   (can-read-parent-collection? (db/select-one [NativeQuerySnippet :collection_id] :id (u/get-id snippet-id)))))

(defn- can-write-parent-collection?
  ([{collection-id :collection-id}]
   (or (not collection-id)
       (i/can-write? Collection collection-id)))

  ([_ snippet-id]
   (can-write-parent-collection? (db/select-one [NativeQuerySnippet :collection_id] :id (u/get-id snippet-id)))))


(u/strict-extend (class NativeQuerySnippet)
  models/IModel
  (merge
   models/IModelDefaults
   {:properties (constantly {:timestamped? true})
    :pre-insert pre-insert
    :pre-update pre-update})

  i/IObjectPermissions
  (merge
   i/IObjectPermissionsDefaults
   ;; Snippets can go in Collections in the `:snippets` namespace (these are called "folders" in the UI) in Metabase
   ;; EE. In Metabase CE, snippets cannot go in a Collection. If a Snippet is not in a Collection, anyone can read or
   ;; write it. If a snippet *is* in a Collection, you need normal Collection permissions to read/write it.
   {:can-read?   can-read-parent-collection?
    :can-write?  can-write-parent-collection?
    :can-create? can-write-parent-collection?}))


;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def NativeQuerySnippetName
  "Schema checking that snippet names do not include \"}\" or start with spaces."
  (s/pred (every-pred
           string?
           (complement #(boolean (re-find #"^\s+" %)))
           (complement #(boolean (re-find #"}" %))))))
