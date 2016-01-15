(ns metabase.models.activity
  (:require [metabase.db :refer [exists?]]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [database :refer [Database]]
                             [interface :as i]
                             [pulse :refer [Pulse]]
                             [table :refer [Table]]
                             [user :refer [User]])
            [metabase.util :as u]))


(i/defentity Activity :activity)

(defn- pre-insert [{:keys [details] :as activity}]
  (let [defaults {:timestamp (u/new-sql-timestamp)
                  :details {}}]
    (merge defaults activity)))

(defn- post-select [{:keys [user_id database_id table_id model model_id] :as activity}]
  (assoc activity
         :user         (delay (User user_id))
         :database     (delay (select-keys (Database database_id) [:id :name :description]))
         :table        (delay (select-keys (Table table_id) [:id :name :display_name :description]))
         :model_exists (delay (case model
                                "card"      (exists? Card :id model_id)
                                "dashboard" (exists? Dashboard :id model_id)
                                "pulse"     (exists? Pulse :id model_id)
                                nil))))

(extend (class Activity)
  i/IEntity
  (merge i/IEntityDefaults
         {:types       (constantly {:details :json, :topic :keyword})
          :can-read?   i/publicly-readable?
          :can-write?  i/publicly-writeable?
          :pre-insert  pre-insert
          :post-select post-select}))


(u/require-dox-in-this-namespace)
