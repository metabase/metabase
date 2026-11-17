(ns metabase.permissions.models.data-permissions
  "The `data_permissions` model: its table, column transforms and hooks. The permissions it holds are read and written
  through [[metabase.permissions.data-permissions]]."
  (:require
   [metabase.models.interface :as mi]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(doto :model/DataPermissions
  (derive :metabase/model))

(methodical/defmethod t2/table-name :model/DataPermissions [_model] :data_permissions)

(t2/deftransforms :model/DataPermissions
  {:perm_type  mi/transform-keyword
   :perm-type  mi/transform-keyword
   :perm_value mi/transform-keyword
   ;; define keyword transformation for :type and :value as well so that we can use them as aliases
   :type       mi/transform-keyword
   :value      mi/transform-keyword})

(t2/define-after-select :model/DataPermissions
  [permissions]
  ;; unique_perms_helper is a generated column backing the unique constraint; it is not part of the
  ;; model and must not round-trip into inserts.
  (dissoc permissions :unique_perms_helper))

(t2/define-before-insert :model/DataPermissions
  [permission]
  (data-perms/assert-valid-permission permission)
  (data-perms/assert-no-destination-db-permissions! [permission])
  permission)

(t2/define-before-update :model/DataPermissions
  [_permission]
  (throw (Exception. (tru "You cannot update a permissions entry! Delete it and create a new one."))))
