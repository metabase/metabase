(ns metabase.api.activity
  (:require [clojure.set :as set]
            [compojure.core :refer [GET]]
            [medley.core :as m]
            [metabase.api.common :refer [*current-user-id* defendpoint define-routes]]
            [metabase.models.activity :refer [Activity]]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.interface :as mi]
            [metabase.models.table :refer [Table]]
            [metabase.models.view-log :refer [ViewLog]]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(defn- dashcard-activity? [activity]
  (#{:dashboard-add-cards :dashboard-remove-cards}
   (:topic activity)))

(defn- activities->referenced-objects
  "Get a map of model name to a set of referenced IDs in these `activities`.

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
  (merge
   (when-let [card-ids (get referenced-objects "card")]
     (let [id->dataset?                       (db/select-id->field :dataset Card
                                                                   :id [:in card-ids])
           {dataset-ids true card-ids' false} (group-by (comp boolean id->dataset?)
                                                        ;; only existing ids go back
                                                        (keys id->dataset?))]
       (cond-> {}
         (seq dataset-ids) (assoc "dataset" (set dataset-ids))
         (seq card-ids')   (assoc "card" (set card-ids')))))
   (into {} (for [[model ids] (dissoc referenced-objects "card")
                  :when       (seq ids)]
              {model (case model
                       "dashboard" (db/select-ids 'Dashboard, :id [:in ids])
                       "metric"    (db/select-ids 'Metric,    :id [:in ids], :archived false)
                       "pulse"     (db/select-ids 'Pulse,     :id [:in ids])
                       "segment"   (db/select-ids 'Segment,   :id [:in ids], :archived false)
                       nil)})))) ; don't care about other models

(defn- add-model-exists-info
  "Add `:model_exists` keys to `activities`, and `:exists` keys to nested dashcards where appropriate."
  [activities]
  (let [existing-objects (-> activities activities->referenced-objects referenced-objects->existing-objects)
        existing-dataset? (fn [card-id]
                            (contains? (get existing-objects "dataset") card-id))]
    (for [{:keys [model_id], :as activity} activities]
      (let [model (if (and (= (:model activity) "card")
                           (existing-dataset? (:model_id activity)))
                    "dataset"
                    (:model activity))]
        (cond-> (assoc activity
                       :model_exists (contains? (get existing-objects model) model_id)
                       :model model)
          (dashcard-activity? activity)
          (update-in [:details :dashcards]
                     (fn [dashcards]
                       (for [dashcard dashcards]
                         (assoc dashcard :exists
                                (or (existing-dataset? (:card_id dashcard))
                                    (contains? (get existing-objects "card")
                                               (:card_id dashcard))))))))))))

(defendpoint GET "/"
  "Get recent activity."
  []
  (filter mi/can-read? (-> (db/select Activity, {:order-by [[:timestamp :desc]], :limit 40})
                           (hydrate :user :table :database)
                           add-model-exists-info)))

(defn- models-for-views
  "Returns a map of {model {id instance}} for activity views suitable for looking up by model and id to get a model."
  [views]
  (letfn [(select-items! [model ids]
            (when (seq ids)
              (db/select
               (case model
                 "card"      [Card      :id :name :collection_id :description :display
                                        :dataset_query :dataset]
                 "dashboard" [Dashboard :id :name :collection_id :description]
                 "table"     [Table     :id :name :db_id :display_name :initial_sync_status])
               {:where [:in :id ids]})))
          (by-id [models] (m/index-by :id models))]
    (into {} (map (fn [[model models]]
                    [model (->> models
                                (map :model_id)
                                (select-items! model)
                                (by-id))]))
          (group-by :model views))))

(defendpoint GET "/recent_views"
  "Get the list of 10 things the current user has been viewing most recently."
  []
  ;; expected output of the query is a single row per unique model viewed by the current user
  ;; including a `:max_ts` which has the most recent view timestamp of the item and `:cnt` which has total views
  ;; and we order the results by most recently viewed then hydrate the basic details of the model
  (let [views (db/select [ViewLog :user_id :model :model_id
                          [:%count.* :cnt] [:%max.timestamp :max_ts]]
                         {:group-by [:user_id :model :model_id]
                          :where    [:and
                                     [:= :user_id *current-user-id*]
                                     [:in :model #{"card" "dashboard" "table"}]]
                          :order-by [[:max_ts :desc]]
                          :limit    5})
        model->id->items (models-for-views views)]
    (for [{:keys [model model_id] :as view-log} views
          :let [model-object (get-in model->id->items [model model_id])]
          :when (and model-object (mi/can-read? model-object))]
      (cond-> (assoc view-log :model_object (dissoc model-object :dataset_query))
        (:dataset model-object) (assoc :model "dataset")))))

(define-routes)
