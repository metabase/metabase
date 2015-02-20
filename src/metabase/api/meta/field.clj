(ns metabase.api.meta.field
  (:require [compojure.core :refer [GET PUT]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [field :refer [Field]])))

(defendpoint GET "/:id" [id]
  ;; TODO check can read
  (->404 (sel :one Field :id id)
         (hydrate [:table :db])))

(defendpoint PUT "/:id" [id :as {{:keys [special_type preview_display description]} :body}]
  (check-404 (exists? Field :id id))
  ;; TODO check can write
  (upd Field id :special_type special_type :preview_display preview_display :description description))

(defendpoint GET "/:id/summary" [id]
  ;; TODO - check can read
  (let-404 [{:keys [count distinct-count]} (sel :one Field :id id)]
    [[:count @count]
     [:distincts @distinct-count]]))

;; ## TODO - Endpoints not yet implemented
;; (defendpoint GET "/:id/values" [id])
;; (defendpoint GET "/:id/foreignkeys" [id])

(define-routes)
