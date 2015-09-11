(ns metabase.api.activity
  (:require [compojure.core :refer [GET POST]]
            [korma.core :as k]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [activity :refer [Activity]]
                             [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [hydrate :refer [hydrate]]
                             [user :refer [User]]
                             [view-log :refer [ViewLog]])))

(defendpoint GET "/"
  "Get recent activity."
  []
  (-> (db/sel :many Activity (k/order :timestamp :DESC) (k/limit 40))
      (hydrate :user :table :database :model_exists)))

(defendpoint GET "/recent_views"
  "Get the list of 15 things the current user has been viewing most recently."
  []
  ;; use a custom Korma query because we are doing some groupings and aggregations
  ;; expected output of the query is a single row per unique model viewed by the current user
  ;; including a `:max_ts` which has the most recent view timestamp of the item and `:cnt` which has total views
  ;; and we order the results by most recently viewed then hydrate the basic details of the model
  (-> (->> (k/select ViewLog
             (k/fields :user_id :model :model_id)
             (k/aggregate (count :*) :cnt)
             (k/aggregate (max :timestamp) :max_ts)
             (k/where (= :user_id *current-user-id*))
             (k/group :user_id :model :model_id)
             (k/order :max_ts :desc)
             (k/limit 10))
           (map #(assoc % :model_object (delay (case (:model %)
                                         "card" (-> (Card (:model_id %))
                                                    (select-keys [:id :name :description :display]))
                                         "dashboard" (-> (Dashboard (:model_id %))
                                                         (select-keys [:id :name :description]))
                                         nil)))))
      (hydrate :model_object)
      (->> (filter (fn [v] (not (empty? (:model_object v))))))))

(define-routes)
