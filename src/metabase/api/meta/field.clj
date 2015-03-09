(ns metabase.api.meta.field
  (:require [compojure.core :refer [GET PUT]]
            [medley.core :as medley]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [field :refer [Field]])
            [metabase.util :as u]))

(defendpoint GET "/:id" [id]
  (->404 (sel :one Field :id id)
         read-check
         (hydrate [:table :db])))

(defendpoint PUT "/:id" [id :as {body :body}]
  (write-check Field id)
  (check-500 (->> (u/select-non-nil-keys body :special_type :preview_display :description)
                  (medley/mapply upd Field id)))
  (sel :one Field :id id))

(defendpoint GET "/:id/summary" [id]
  (let-404 [{:keys [count distinct-count] :as field} (sel :one Field :id id)]
    (read-check field)
    [[:count @count]
     [:distincts @distinct-count]]))

;; ## TODO - Endpoints not yet implemented
;; (defendpoint GET "/:id/values" [id])
;; (defendpoint GET "/:id/foreignkeys" [id])

(define-routes)
