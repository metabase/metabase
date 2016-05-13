(ns metabase.api.activity
  (:require [compojure.core :refer [GET]]
            [honeysql.helpers :as h]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [activity :refer [Activity]]
                             [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [hydrate :refer [hydrate]]
                             [view-log :refer [ViewLog]])))

(defn- dashcard-exists [{:keys [topic] :as activity}]
  (if-not (contains? #{:dashboard-add-cards :dashboard-remove-cards} topic)
    activity
    (update-in activity [:details :dashcards] (fn [dashcards]
                                                (for [dashcard dashcards]
                                                  (assoc dashcard :exists (db/exists? Card :id (:card_id dashcard))))))))

(defendpoint GET "/"
  "Get recent activity."
  []
  (-> (db/sel Activity {:order-by [[:timestamp :desc]], :limit 40})
      (hydrate :user :table :database :model_exists)
      (->> (mapv dashcard-exists))))

(defendpoint GET "/recent_views"
  "Get the list of 15 things the current user has been viewing most recently."
  []
  ;; use a custom HoneySQL query because we are doing some groupings and aggregations
  ;; expected output of the query is a single row per unique model viewed by the current user
  ;; including a `:max_ts` which has the most recent view timestamp of the item and `:cnt` which has total views
  ;; and we order the results by most recently viewed then hydrate the basic details of the model
  (for [view-log (db/sel [ViewLog :user_id :model :model_id [:%count.* :cnt] [:%max.timestamp :max_ts]]
                   :user_id *current-user-id*
                   (-> (h/group :user_id :model :model_id)
                       (h/order-by [:max_ts :desc])
                       (h/limit 10)))
        :let     [model-object (case (:model view-log)
                                 "card"      (db/sel-1 [Card :id :name :description :display], :id (:model_id view-log))
                                 "dashboard" (db/sel-1 [Dashboard :id :name :description],     :id (:model_id view-log))
                                 nil)]
        :when    model-object]
    (assoc view-log :model_object model-object)))

(define-routes)
