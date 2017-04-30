(ns metabase.models.database
  (:require [cheshire.generate :refer [add-encoder encode-map]]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.api.common :refer [*current-user*]]
            [metabase.models
             [interface :as i]
             [permissions :as perms]
             [permissions-group :as perm-group]]
            [toucan
             [db :as db]
             [models :as models]]))

;;; ------------------------------------------------------------ Entity & Lifecycle ------------------------------------------------------------

(models/defmodel Database :metabase_database)

(defn- post-insert [{database-id :id, :as database}]
  (u/prog1 database
    ;; add this database to the all users and metabot permissions groups
    (doseq [{group-id :id} [(perm-group/all-users)
                            (perm-group/metabot)]]
      (perms/grant-full-db-permissions! group-id database-id))))

(defn- post-select [{:keys [engine] :as database}]
  (if-not engine database
          (assoc database :features (set (when-let [driver ((resolve 'metabase.driver/engine->driver) engine)]
                                           ((resolve 'metabase.driver/features) driver))))))

(defn- pre-delete [{:keys [id]}]
  (db/delete! 'Card        :database_id id)
  (db/delete! 'Permissions :object      [:like (str (perms/object-path id) "%")])
  (db/delete! 'Table       :db_id       id)
  (db/delete! 'RawTable    :database_id id))


(defn- perms-objects-set [database _]
  #{(perms/object-path (u/get-id database))})


(u/strict-extend (class Database)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:database :db])
          :types          (constantly {:details :encrypted-json, :engine :keyword})
          :properties     (constantly {:timestamped? true})
          :post-insert    post-insert
          :post-select    post-select
          :pre-delete     pre-delete})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:perms-objects-set  perms-objects-set
          :can-read?          (partial i/current-user-has-partial-permissions? :read)
          :can-write?         i/superuser?}))


;;; ------------------------------------------------------------ Hydration / Util Fns ------------------------------------------------------------

(defn ^:hydrate tables
  "Return the `Tables` associated with this `Database`."
  [{:keys [id]}]
  (db/select 'Table, :db_id id, :active true, {:order-by [[:%lower.display_name :asc]]}))

(defn schema-names
  "Return a *sorted set* of schema names (as strings) associated with this `Database`."
  [{:keys [id]}]
  (when id
    (apply sorted-set (db/select-field :schema 'Table
                        :db_id id
                        {:modifiers [:DISTINCT]}))))

(defn pk-fields
  "Return all the primary key `Fields` associated with this DATABASE."
  [{:keys [id]}]
  (let [table-ids (db/select-ids 'Table, :db_id id, :active true)]
    (when (seq table-ids)
      (db/select 'Field, :table_id [:in table-ids], :special_type (mdb/isa :type/PK)))))

(defn schema-exists?
  "Does DATABASE have any tables with SCHEMA?"
  ^Boolean [{:keys [id]}, schema]
  (db/exists? 'Table :db_id id, :schema (some-> schema name)))


;;; ------------------------------------------------------------ JSON Encoder ------------------------------------------------------------

(def ^:const protected-password
  "The string to replace passwords with when serializing Databases."
  "**MetabasePass**")

(add-encoder DatabaseInstance (fn [db json-generator]
                                (encode-map (cond
                                              (not (:is_superuser @*current-user*)) (dissoc db :details)
                                              (get-in db [:details :password])      (assoc-in db [:details :password] protected-password)
                                              (get-in db [:details :pass])          (assoc-in db [:details :pass] protected-password)     ; MongoDB uses "pass" instead of password
                                              :else                                 db)
                                            json-generator)))
