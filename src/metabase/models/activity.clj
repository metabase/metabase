(ns metabase.models.activity
  (:require (metabase [db :as db]
                      [events :as events])
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [database :refer [Database]]
                             [interface :as i]
                             [metric :refer [Metric]]
                             [pulse :refer [Pulse]]
                             [segment :refer [Segment]]
                             [table :refer [Table]]
                             [user :refer [User]])
            [metabase.util :as u]))


(i/defentity Activity :activity)

(defn- pre-insert [{:keys [details] :as activity}]
  (let [defaults {:timestamp (u/new-sql-timestamp)
                  :details {}}]
    (merge defaults activity)))

(defn model-exists?
  "Does the object associated with this `Activity` exist in the DB?"
  {:hydrate :model_exists, :arglists '([activity])}
  [{:keys [model model_id]}]
  (case model
    "card"      (db/exists? Card,      :id model_id)
    "dashboard" (db/exists? Dashboard, :id model_id)
    "metric"    (db/exists? Metric,    :id model_id, :is_active true)
    "pulse"     (db/exists? Pulse,     :id model_id)
    "segment"   (db/exists? Segment,   :id model_id, :is_active true)
                 nil))

(extend (class Activity)
  i/IEntity
  (merge i/IEntityDefaults
         {:types       (constantly {:details :json, :topic :keyword})
          :can-read?   i/publicly-readable?
          :can-write?  i/publicly-writeable?
          :pre-insert  pre-insert}))


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
