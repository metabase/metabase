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
  (for [view-log (k/select ViewLog
                           (k/fields :user_id :model :model_id)
                           (k/aggregate (count :*) :cnt)
                           (k/aggregate (max :timestamp) :max_ts)
                           (k/where (= :user_id *current-user-id*))
                           (k/group :user_id :model :model_id)
                           (k/order :max_ts :desc)
                           (k/limit 10))
        :let     [model-object (case (:model view-log)
                                 "card"      (db/sel :one [Card :id :name :description :display], :id (:model_id view-log))
                                 "dashboard" (db/sel :one [Dashboard :id :name :description],     :id (:model_id view-log))
                                 nil)]
        :when    model-object]
    (assoc view-log :model_object model-object)))

(define-routes)
