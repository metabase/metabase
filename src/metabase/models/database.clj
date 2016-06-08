(ns metabase.models.database
  (:require [cheshire.generate :refer [add-encoder encode-map]]
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


(add-encoder DatabaseInstance (fn [db json-generator]
                                (encode-map (cond
                                              (not (:is_superuser @*current-user*)) (dissoc db :details)
                                              (get-in db [:details :password])      (assoc-in db [:details :password] protected-password)
                                              :else                                 db)
                                            json-generator)))
