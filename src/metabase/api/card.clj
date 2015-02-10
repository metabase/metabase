(ns metabase.api.card
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.card :refer :all]
            [metabase.models.hydrate :refer [hydrate]]))

(defendpoint GET "/:id" [id]
  (or-404-> (sel :one Card :id id)))

(defendpoint GET "/" [org f] ; TODO - need to do something with the `f` param
  (-> (sel :many Card :organization_id org)
      (hydrate :creator)))

(define-routes)
