(ns metabase.models.table-fingerprint
  (:require [clojure
             [data :as d]
             [string :as s]]
            [metabase.models
             [field-values :refer [FieldValues]]
             [humanization :as humanization]
             [interface :as i]
             [permissions :as perms]]
            [metabase.sync-database.infer-special-type :as infer-special-type]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel TableFingerprint :table_fingerprint)

(defn- perms-objects-set [database _]
  #{(perms/object-path (u/get-id database))})

(u/strict-extend (class TableFingerprint)
  models/IModel
  (merge models/IModelDefaults
         {:types          (constantly {})
          :properties     (constantly {:timestamped? true})})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:perms-objects-set  perms-objects-set
          :can-read?          (partial i/current-user-has-full-permissions? :read)
          :can-write?         i/superuser?}))
