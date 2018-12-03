(ns metabase.models.activity
  (:require [metabase
             [events :as events]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [interface :as i]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]]
            [metabase.util.date :as du]
            [toucan
             [db :as db]
             [models :as models]]))

;;; ------------------------------------------------- Perms Checking -------------------------------------------------

(def ^:private model->entity
  {"card"      Card
   "dashboard" Dashboard
   "metric"    Metric
   "pulse"     Pulse
   "segment"   Segment})

(defn- can-? [f {model :model, model-id :model_id, :as activity}]
  (if-let [object (when-let [entity (model->entity model)]
                    (entity model-id))]
    (f object)
    true))


;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel Activity :activity)

(defn- pre-insert [activity]
  (let [defaults {:timestamp (du/new-sql-timestamp)
                  :details   {}}]
    (merge defaults activity)))

(u/strict-extend (class Activity)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:details :json, :topic :keyword})
          :pre-insert pre-insert})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?  (partial can-? i/can-read?)
          :can-write? (partial can-? i/can-write?)}))


;;; ------------------------------------------------------ Etc. ------------------------------------------------------


;; ## Persistence Functions

;; TODO - this is probably the exact wrong way to have written this functionality.
;; This could have been a multimethod or protocol, and various entity classes could implement it;
;; Furthermore, we could have just used *current-user-id* to get the responsible user, instead of leaving it open to
;; user error.

(defn record-activity!
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

   ex: (record-activity!
         :topic       :segment-update
         :object      segment
         :database-id 1
         :table-id    13
         :details-fn  #(dissoc % :some-key))"
  {:style/indent 0}
  [& {:keys [topic object details-fn database-id table-id user-id model model-id]}]
  {:pre [(keyword? topic)]}
  (let [object (or object {})]
    (db/insert! Activity
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
