(ns metabase.models.native-query-snippet
  (:require [metabase.models
             [collection :as collection]
             [interface :as i]]
            [metabase.models.native-query-snippet.permissions :as snippet.perms]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [deferred-tru tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [models :as models]]))

;; Load the EE implementation of snippet permissions, if they exist (if we're running with EE code available).
(u/ignore-exceptions
  (classloader/require 'metabase-enterprise.enhancements.models.native-query-snippet.permissions))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel NativeQuerySnippet :native_query_snippet)

(defmethod collection/allowed-namespaces (class NativeQuerySnippet)
  [_]
  #{:snippets})

(defn- pre-insert [snippet]
  (u/prog1 snippet
    (collection/check-collection-namespace NativeQuerySnippet (:collection_id snippet))))

(defn- pre-update [{:keys [creator_id id], :as updates}]
  (u/prog1 updates
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? updates :creator_id)
      (when (not= creator_id (db/select-one-field :creator_id NativeQuerySnippet :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a NativeQuerySnippet.")))))
    (collection/check-collection-namespace NativeQuerySnippet (:collection_id updates))))

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
   {:can-read?   snippet.perms/can-read?
    :can-write?  snippet.perms/can-write?
    :can-create? snippet.perms/can-create?}))


;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def NativeQuerySnippetName
  "Schema checking that snippet names do not include \"}\" or start with spaces."
  (su/with-api-error-message
   (s/pred (every-pred
            string?
            (complement #(boolean (re-find #"^\s+" %)))
            (complement #(boolean (re-find #"}" %)))))
   (deferred-tru "snippet names cannot include '}' or start with spaces")))
