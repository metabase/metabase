(ns metabase.models.native-query-snippet
  (:require [metabase.models
             [interface :as i]
             [permissions :as perms]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru]]
            [schema.core :as s]
            [toucan.models :as models]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel NativeQuerySnippet :native_query_snippet)

(defn- perms-objects-set
  "Permissions to read or write a native query snippet are the same as those of its parent Database."
  [snippet _]
  #{(perms/object-path (u/get-id (:database-id snippet)))})

(u/strict-extend (class NativeQuerySnippet)
  models/IModel
  (merge
   models/IModelDefaults
   {:properties (constantly {:timestamped? true})})

  i/IObjectPermissions
  (merge
   i/IObjectPermissionsDefaults
   {:can-read?         (partial i/current-user-has-full-permissions? :read)
    :can-write?        (partial i/current-user-has-full-permissions? :write)
    :perms-objects-set perms-objects-set}))


;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def NativeQuerySnippetName
  "Schema checking that snippet names do not include \"}}\""
  (s/pred (comp
           (complement #(boolean (re-find #"}}" %)))
           string?)))
