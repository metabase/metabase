(ns metabase.permissions.models.data-permissions
  "The `data_permissions` model: its table, column transforms and hooks. The permissions it holds are read and written
  through [[metabase.permissions.data-permissions]]."
  (:require
   [metabase.models.interface :as mi]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.db :as permissions.db]
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

(defn- create-queries-without-native?
  "Whether `row` is a create-queries row that leaves its group without native query access on the whole Database."
  [row]
  (and (= :perms/create-queries (keyword (:perm_type row)))
       (not (database-native? row))))

(defn- stored-pairs
  "The `[group-id db-id]` pairs of `rows` that have a stored database-level `perm-type` row of `perm-value`."
  [rows perm-type perm-value]
  (if (seq rows)
    (permissions.db/database-level-value-pairs (into #{} (map :group_id) rows)
                                               (into #{} (map :db_id) rows)
                                               perm-type
                                               perm-value)
    #{}))

(defn- check-transforms-need-native
  "Throws a 400 when `rows`, the rows of one insert, leave a group with the transforms permission on a Database where it
  has no database-level native query access, counting the stored rows and the rows of the insert."
  [rows]
  (let [pair            (juxt :group_id :db_id)
        native-inserted (into #{} (comp (filter database-native?) (map pair)) rows)
        granted         (remove (comp native-inserted pair) (filter transforms-granted? rows))
        restricted      (filter create-queries-without-native? rows)
        native-stored   (stored-pairs granted "perms/create-queries" "query-builder-and-native")
        granted-stored  (stored-pairs restricted "perms/transforms" "yes")]
    (when (or (some (comp not native-stored pair) granted)
              (some (comp granted-stored pair) restricted))
      (throw (ex-info (tru "Transforms permission requires \"Query builder and native\" data access for the database.")
                      {:status-code 400})))))

(mi/define-before-insert :model/DataPermissions
  [rows]
  (check-transforms-need-native rows)
  rows)

(t2/define-before-insert :model/DataPermissions
  [permission]
  (data-perms/assert-valid-permission permission)
  (data-perms/assert-no-destination-db-permissions! [permission])
  permission)

(t2/define-before-update :model/DataPermissions
  [_permission]
  (throw (ex-info (tru "You cannot update a permissions entry! Delete it and create a new one.") {:status-code 400})))
