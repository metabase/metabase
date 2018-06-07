(ns metabase.api.activity
  (:require [clojure.set :as set]
            [compojure.core :refer [GET]]
            [metabase.api.common :refer [*current-user-id* defendpoint define-routes]]
            [metabase.models
             [activity :refer [Activity]]
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [interface :as mi]
             [view-log :refer [ViewLog]]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(defn- dashcard-activity? [activity]
  (contains? #{:dashboard-add-cards :dashboard-remove-cards}
             (:topic activity)))

(defn- activities->referenced-objects
  "Get a map of model name to a set of referenced IDs in these ACTIVITIES.

     (activities->referenced-objects <some-activities>) -> {\"dashboard\" #{41 42 43}, \"card\" #{100 101}, ...}"
  [activities]
  (apply merge-with set/union (for [{:keys [model model_id], :as activity} activities
                                    :when                                  model]
                                (merge {model #{model_id}}
                                       ;; pull the referenced card IDs out of the dashcards for dashboard activites
                                       ;; that involve adding/removing cards
                                       (when (dashcard-activity? activity)
                                         {"card" (set (for [dashcard (get-in activity [:details :dashcards])]
                                                        (:card_id dashcard)))})))))

(defn- referenced-objects->existing-objects
  "Given a map of existing objects like the one returned by `activities->referenced-objects`, return a similar map of
   models to IDs of objects *that exist*.

     (referenced-objects->existing-objects {\"dashboard\" #{41 42 43}, \"card\" #{100 101}, ...})
     ;; -> {\"dashboard\" #{41 43}, \"card\" #{101}, ...}"
  [referenced-objects]
  (into {} (for [[model ids] referenced-objects
                 :when       (seq ids)]
             {model (case model
                      "card"      (db/select-ids 'Card,      :id [:in ids])
                      "dashboard" (db/select-ids 'Dashboard, :id [:in ids])
                      "metric"    (db/select-ids 'Metric,    :id [:in ids], :archived false)
                      "pulse"     (db/select-ids 'Pulse,     :id [:in ids])
                      "segment"   (db/select-ids 'Segment,   :id [:in ids], :archived false)
                      nil)}))) ; don't care about other models

(defn- add-model-exists-info
  "Add `:model_exists` keys to ACTIVITIES, and `:exists` keys to nested dashcards where appropriate."
  [activities]
  (let [existing-objects (-> activities activities->referenced-objects referenced-objects->existing-objects)]
    (for [{:keys [model model_id], :as activity} activities]
      (let [activity (assoc activity :model_exists (contains? (get existing-objects model) model_id))]
        (if-not (dashcard-activity? activity)
          activity
          (update-in activity [:details :dashcards] (fn [dashcards]
                                                      (for [dashcard dashcards]
                                                        (assoc dashcard :exists (contains? (get existing-objects "card")
                                                                                           (:card_id dashcard)))))))))))

(defendpoint GET "/"
  "Get recent activity."
  []
  (filter mi/can-read? (-> (db/select Activity, {:order-by [[:timestamp :desc]], :limit 40})
                               (hydrate :user :table :database)
                               add-model-exists-info)))

(defn- view-log-entry->matching-object [{:keys [model model_id]}]
  (when (contains? #{"card" "dashboard"} model)
    (db/select-one
        (case model
          "card"      [Card      :id :name :collection_id :description :display :dataset_query]
          "dashboard" [Dashboard :id :name :collection_id :description])
        :id model_id)))

(defendpoint GET "/recent_views"
  "Get the list of 10 things the current user has been viewing most recently."
  []
  ;; expected output of the query is a single row per unique model viewed by the current user
  ;; including a `:max_ts` which has the most recent view timestamp of the item and `:cnt` which has total views
  ;; and we order the results by most recently viewed then hydrate the basic details of the model
  (for [view-log (db/select [ViewLog :user_id :model :model_id [:%count.* :cnt] [:%max.timestamp :max_ts]]
                   :user_id *current-user-id*
                   {:group-by [:user_id :model :model_id]
                    :order-by [[:max_ts :desc]]
                    :limit    10})
        :let     [model-object (view-log-entry->matching-object view-log)]
        :when    (and model-object
                      (mi/can-read? model-object))]
    (assoc view-log :model_object (dissoc model-object :dataset_query))))


(define-routes)
