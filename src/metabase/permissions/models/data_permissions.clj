(ns metabase.permissions.models.data-permissions
  "The `data_permissions` model: its table, column transforms and hooks. The permissions it holds are read and written
  through [[metabase.permissions.data-permissions]]."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.permissions.app-db-copy :as permissions.app-db-copy]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.db :as permissions.db]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(doto :model/DataPermissions
  (derive :metabase/model))

(methodical/defmethod t2/table-name :model/DataPermissions [_model] :data_permissions)

(defmethod app-db-copy/spec :model/DataPermissions [_model]
  {:skip?     false
   :transform permissions.app-db-copy/transform-data-permissions})

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

(defn- database-native?
  "Whether `row` gives native query access on its whole Database."
  [{:keys [perm_type perm_value table_id]}]
  (and (nil? table_id)
       (= :perms/create-queries (keyword perm_type))
       (= :query-builder-and-native (keyword perm_value))))

(defn- transforms-granted?
  "Whether `row` grants the transforms permission."
  [{:keys [perm_type perm_value]}]
  (and (= :perms/transforms (keyword perm_type))
       (= :yes (keyword perm_value))))

(defn- database-create-queries-without-native?
  "Whether `row` is a database-level create-queries row that leaves its group without native query access on the whole
  Database."
  [row]
  (and (nil? (:table_id row))
       (= :perms/create-queries (keyword (:perm_type row)))
       (not (database-native? row))))

(defn- check-transforms-need-native
  "Throws a 400 when `row` would leave its group with the transforms permission on a Database where it has no stored
  database-level native query access; table-level create-queries rows are left to the writers, which revoke the
  transforms permission with them, so a bulk write does not read once per Table."
  [{:keys [group_id db_id] :as row}]
  (when (and (transforms-granted? row)
             (not (permissions.db/database-level-value? group_id db_id "perms/create-queries" "query-builder-and-native")))
    (throw (ex-info (tru "Transforms permission requires \"Query builder and native\" data access for the database.")
                    {:status-code 400})))
  (when (and (database-create-queries-without-native? row)
             (permissions.db/database-level-value? group_id db_id "perms/transforms" "yes"))
    (throw (ex-info (tru "Transforms permission requires \"Query builder and native\" data access for the database.")
                    {:status-code 400}))))

(t2/define-before-insert :model/DataPermissions
  [permission]
  (check-transforms-need-native permission)
  (data-perms/assert-valid-permission permission)
  (data-perms/assert-no-destination-db-permissions! [permission])
  permission)

(t2/define-before-update :model/DataPermissions
  [_permission]
  (throw (ex-info (tru "You cannot update a permissions entry! Delete it and create a new one.") {:status-code 400})))
