(ns metabase.models.database
  (:require [clojure.string :as s]
            [cheshire.generate :refer [add-encoder encode-map]]
            [metabase.api.common :refer [*current-user*]]
            [metabase.db :as db]
            (metabase.models [interface :as i]
                             [permissions, :as perms]
                             [permissions-group :as perm-group])
            [metabase.util :as u]))

;;; ------------------------------------------------------------ Entity & Lifecycle ------------------------------------------------------------

(i/defentity Database :metabase_database)

(defn- post-insert [{database-id :id, :as database}]
  (u/prog1 database
    ;; add this database to the all users and metabot permissions groups
    (doseq [{group-id :id} [(perm-group/all-users)
                            (perm-group/metabot)]]
      (perms/grant-full-db-permissions! group-id database-id))))

(defn- post-select [{:keys [engine] :as database}]
  (if-not engine database
          (assoc database :features (or (when-let [driver ((resolve 'metabase.driver/engine->driver) engine)]
                                          (seq ((resolve 'metabase.driver/features) driver)))
                                        []))))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete! 'Card        :database_id id)
  (db/cascade-delete! 'Permissions :object      [:like (str (perms/object-path id) "%")])
  (db/cascade-delete! 'Table       :db_id       id)
  (db/cascade-delete! 'RawTable    :database_id id))


(defn- perms-objects-set [database _]
  #{(perms/object-path (u/get-id database))})


(u/strict-extend (class Database)
  i/IEntity
  (merge i/IEntityDefaults
         {:hydration-keys     (constantly [:database :db])
          :types              (constantly {:details :json, :engine :keyword})
          :timestamped?       (constantly true)
          :perms-objects-set  perms-objects-set
          :can-read?          (partial i/current-user-has-partial-permissions? :read)
          :can-write?         i/superuser?
          :post-insert        post-insert
          :post-select        post-select
          :pre-cascade-delete pre-cascade-delete}))


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
      (db/select 'Field, :table_id [:in table-ids], :special_type (db/isa :type/PK)))))

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
