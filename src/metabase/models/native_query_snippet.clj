(ns metabase.models.native-query-snippet
  (:require [metabase.models
             [interface :as i]
             [permissions :as perms]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [models :as models]]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel NativeQuerySnippet :native_query_snippet)

(defn- pre-update [{:keys [creator_id id], :as updates}]
  (u/prog1 updates
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? updates :creator_id)
      (when (not= creator_id (db/select-one-field :creator_id NativeQuerySnippet :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a NativeQuerySnippet.")))))))

(defn- perms-objects-set
  "Permissions to read or write a NativeQuerySnippet are the same as native query access."
  [snippet _]
  #{(perms/adhoc-native-query-path (:database_id snippet))})

(u/strict-extend (class NativeQuerySnippet)
  models/IModel
  (merge
   models/IModelDefaults
   {:properties (constantly {:timestamped? true})
    :pre-update pre-update})

  i/IObjectPermissions
  (merge
   i/IObjectPermissionsDefaults
   {:perms-objects-set perms-objects-set
    :can-read?         (partial i/current-user-has-full-permissions? :write)
    :can-write?        (partial i/current-user-has-full-permissions? :write)
    :can-create?       (partial i/current-user-has-full-permissions? :write)}))


;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def NativeQuerySnippetName
  "Schema checking that snippet names do not include \"}\" or start with spaces."
  (s/pred (every-pred
           string?
           (complement #(boolean (re-find #"^\s+" %)))
           (complement #(boolean (re-find #"}" %))))))
