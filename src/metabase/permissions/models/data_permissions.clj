(ns metabase.permissions.models.data-permissions
  "The `data_permissions` model: its table, column transforms, hooks and writes. The permissions it holds are read and
  computed through [[metabase.permissions.data-permissions]]."
  (:require
   [clojure.string :as str]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.permissions.app-db-copy :as permissions.app-db-copy]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
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

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- assert-valid-permission
  "Throws unless `permission` has a valid permission type and a value of that type."
  [{:keys [perm_type perm_value] :as permission}]
  (when-not (mr/validate ::permissions.schema/data-permission-type perm_type)
    (throw (ex-info (str/join (mu/explain ::permissions.schema/data-permission-type perm_type)) permission)))
  (let [values (-> permissions.schema/data-permissions perm_type :values)]
    (when-not (contains? (set values) perm_value)
      (throw (ex-info (tru "Invalid permission value {0} for permission type {1}" (pr-str perm_value) perm_type)
                      {:value perm_value :perm-type perm_type :valid-values values})))))

(t2/define-before-insert :model/DataPermissions
  [permission]
  (assert-valid-permission permission)
  permission)

(t2/define-before-update :model/DataPermissions
  [_permission]
  (throw (ex-info (tru "You cannot update a permissions entry! Delete it and create a new one.") {:status-code 400})))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

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

;; Memoized per application DB. Destination status is immutable after creation, so the cache can't go stale.

(def ^:private destination-db-id?
  "Whether `db-id` is a destination database — one with `router_database_id` set."
  (mdb/memoize-for-application-db
   (fn [db-id]
     (permissions.db/destination-database? db-id))))

(defn assert-no-destination-db-permissions!
  "Throws if any row in `perm-rows` targets a destination database — one with `router_database_id`
  set. Destinations are reachable only through their router and must never carry `data_permissions`
  rows."
  [perm-rows]
  (when-let [dest-ids (seq (into #{} (comp (keep :db_id) (filter destination-db-id?)) perm-rows))]
    (throw (ex-info (tru "Cannot grant permissions on a destination database.")
                    {:status-code 400 :destination-db-ids dest-ids}))))

(def ^:private permission-batch-size 1000)

(mu/defn create-data-permissions!
  "Insert the DataPermissions `rows` in batches that stay under the database limit on the parameters of a prepared
  statement, the transforms rows last so that the create-queries rows they are checked against are stored. A row on a
  destination Database, or one leaving its group with the transforms permission but no native query access on the
  Database, is a 400."
  [rows :- [:sequential ::permissions.schema/data-permissions.create]]
  (let [{transforms true, others false} (group-by #(= :perms/transforms (keyword (:perm_type %))) rows)]
    (t2/with-transaction [_conn]
      (doseq [rows  [others transforms]
              batch (partition-all permission-batch-size rows)]
        (run! check-transforms-need-native batch)
        (assert-no-destination-db-permissions! batch)
        (permissions.db/insert-data-permissions! batch)))))

(mu/defn delete-data-permissions!
  "Delete the DataPermissions with `ids`, in batches that stay under the database limit on the parameters of a
  prepared statement."
  [ids :- [:sequential ms/PositiveInt]]
  (doseq [batch (partition-all permission-batch-size ids)]
    (permissions.db/delete-data-permissions! batch)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DataPermissions [_model]
  {:skip?     false
   :transform permissions.app-db-copy/transform-data-permissions})
