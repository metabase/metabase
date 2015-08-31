(ns metabase.api.activity
  (:require [compojure.core :refer [GET POST]]
            [korma.core :as k]
            [metabase.api.common :refer :all]
            [metabase.db :refer [exists? sel]]
            (metabase.models [activity :refer [Activity]]
                             [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [hydrate :refer [hydrate]])))

(defendpoint GET "/"
  "Get recent activity."
  []
  (-> (sel :many Activity (k/order :timestamp :DESC))
      (hydrate :user)))

(define-routes)
