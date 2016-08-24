(ns metabase.models.database
  (:require [clojure.string :as s]
            [cheshire.generate :refer [add-encoder encode-map]]
            [metabase.api.common :refer [*current-user*]]
            [metabase.db :as db]
            [metabase.models.interface :as i]
            [metabase.util :as u]))

(def ^:const protected-password
  "The string to replace passwords with when serializing Databases."
  "**MetabasePass**")


(i/defentity Database :metabase_database)

(defn- post-select [{:keys [engine] :as database}]
  (if-not engine database
          (assoc database :features (or (when-let [driver ((resolve 'metabase.driver/engine->driver) engine)]
                                          (seq ((resolve 'metabase.driver/features) driver)))
                                        []))))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete! 'Card  :database_id id)
  (db/cascade-delete! 'Table :db_id id)
  (db/cascade-delete! 'RawTable :database_id id))

(defn ^:hydrate tables
  "Return the `Tables` associated with this `Database`."
  [{:keys [id]}]
  (db/select 'Table, :db_id id, :active true, {:order-by [[:display_name :asc]]}))

(u/strict-extend (class Database)
  i/IEntity
  (merge i/IEntityDefaults
         {:hydration-keys     (constantly [:database :db])
          :types              (constantly {:details :json, :engine :keyword})
          :timestamped?       (constantly true)
          :can-read?          (constantly true)
          :can-write?         i/superuser?
          :post-select        post-select
          :pre-cascade-delete pre-cascade-delete}))


(defn schema-names
  "Return a *sorted set* of schema names (as strings) associated with this `Database`."
  [{:keys [id]}]
  (when id
    (apply sorted-set (db/select-field :schema 'Table
                        :db_id id
                        {:modifiers [:DISTINCT]}))))

(defn schema-exists?
  "Does DATABASE have any tables with SCHEMA?"
  ^Boolean [{:keys [id]}, schema]
  (db/exists? 'Table :db_id id, :schema (some-> schema name)))


(add-encoder DatabaseInstance (fn [db json-generator]
                                (encode-map (cond
                                              (not (:is_superuser @*current-user*)) (dissoc db :details)
                                              (get-in db [:details :password])      (assoc-in db [:details :password] protected-password)
                                              (get-in db [:details :pass])          (assoc-in db [:details :pass] protected-password)     ; MongoDB uses "pass" instead of password
                                              :else                                 db)
                                            json-generator)))
