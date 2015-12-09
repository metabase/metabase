(ns metabase.models.activity
  (:require [korma.core :refer :all, :exclude [defentity update]]
            [metabase.db :as db]
            [metabase.events :as events]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [database :refer [Database]]
                             [interface :refer :all]
                             [pulse :refer [Pulse]]
                             [segment :refer [Segment]]
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
        (assoc
          :database     (delay (-> (Database database_id)
                                   (select-keys [:id :name :description])))
          :model_exists (delay (case model
                                 "card"      (db/exists? Card :id model_id)
                                 "dashboard" (db/exists? Dashboard :id model_id)
                                 "pulse"     (db/exists? Pulse :id model_id)
                                 "segment"   (db/exists? Segment :id model_id :is_active true)
                                 nil))
          :table        (delay (-> (Table table_id)
                                   (select-keys [:id :name :display_name :description])))
          :user         (delay (User user_id))))))

(extend-ICanReadWrite ActivityEntity :read :public-perms, :write :public-perms)


;; ## Persistence Functions

(defn record-activity
  "Inserts a new `Activity` entry.

   Takes the following kwargs:
     :topic          Required.  The activity topic.
     :object         Optional.  The activity object being saved.
     :database-id    Optional.  ID of the `Database` related to the activity.
     :table-id       Optional.  ID of the `Table` related to the activity.
     :details-fn     Optional.  Gets called with `object` as the arg and the result is saved as the `:details` of the Activity.
     :user-id        Optional.  ID of the `User` responsible for the activity.  defaults to (events/object->user-id object)
     :model          Optional.  name of the model representing the activity.  defaults to (events/topic->model topic)
     :model-id       Optional.  ID of the model representing the activity.  defaults to (events/object->model-id topic object)

   ex: (record-activity
         :topic       :segment-update
         :object      segment
         :database-id 1
         :table-id    13
         :details-fn  #(dissoc % :some-key))"
  [& {:keys [topic object details-fn database-id table-id user-id model model-id]}]
  {:pre [(keyword? topic)]}
  (let [object (or object {})]
    (db/ins Activity
      :topic       topic
      :user_id     (or user-id (events/object->user-id object))
      :model       (or model (events/topic->model topic))
      :model_id    (or model-id (events/object->model-id topic object))
      :database_id database-id
      :table_id    table-id
      :custom_id   (:custom_id object)
      :details     (if (fn? details-fn)
                     (details-fn object)
                     object))))
