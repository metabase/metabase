(ns metabase.api.meta.field
  (:require [compojure.core :refer [GET PUT]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [field :refer [Field]])))

(defendpoint GET "/:id" [id]
  (let-404 [{:keys [can_read] :as field} (sel :one Field :id id)]
    (check-403 @can_read)
    (hydrate field [:table :db])))

(defendpoint PUT "/:id" [id :as {{:keys [special_type preview_display description]} :body}]
  (let-404 [{:keys [can_write]} (sel :one Field :id id)]
    (check-403 @can_write))
  (upd Field id :special_type special_type :preview_display preview_display :description description))

(defendpoint GET "/:id/summary" [id]
  (let-404 [{:keys [can_read count distinct-count]} (sel :one Field :id id)]
    (check-403 @can_read)
    [[:count @count]
     [:distincts @distinct-count]]))

;; ## TODO - Endpoints not yet implemented
;; (defendpoint GET "/:id/values" [id])
;; (defendpoint GET "/:id/foreignkeys" [id])

(define-routes)
