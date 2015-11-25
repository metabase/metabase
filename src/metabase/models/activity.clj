(ns metabase.models.activity
  (:require [korma.core :refer :all, :exclude [defentity update]]
            [metabase.db :refer [exists?]]
            [metabase.events :as events]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [database :refer [Database]]
                             [interface :refer :all]
                             [pulse :refer [Pulse]]
                             [table :refer [Table]]
                             [user :refer [User]])
            [metabase.util :as u]))


(defrecord ActivityFeedItemInstance []
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite ActivityFeedItemInstance :read :public-perms, :write :public-perms)


(defentity Activity
           [(table :activity)
            (types :details :json, :topic :keyword)]

           (pre-insert [_ {:keys [details] :as activity}]
                       (let [defaults {:timestamp (u/new-sql-timestamp)
                                       :details {}}]
                         (merge defaults activity)))

           (post-select [_ {:keys [user_id database_id table_id model model_id] :as activity}]
                        (-> (map->ActivityFeedItemInstance activity)
                            (assoc :user (delay (User user_id)))
                            (assoc :database (delay (-> (Database database_id)
                                                        (select-keys [:id :name :description]))))
                            (assoc :table (delay (-> (Table table_id)
                                                     (select-keys [:id :name :display_name :description]))))
                            (assoc :model_exists (delay (case model
                                                          "card"      (exists? Card :id model_id)
                                                          "dashboard" (exists? Dashboard :id model_id)
                                                          "pulse"     (exists? Pulse :id model_id)
                                                          nil))))))

(extend-ICanReadWrite ActivityEntity :read :public-perms, :write :public-perms)
