(ns metabase.api.dash
  "/api/meta/dash endpoints.")
(metabase.require/api)

(defendpoint GET "/" [org f] ; TODO - what to do with f ?
  (-> (sel :many Dashboard :organization_id org)
      (hydrate :creator :organization)))

(defendpoint GET "/:id" [id]
  (let-404 [db (-> (sel :one Dashboard :id id)
                   (hydrate :creator :organization [:ordered_cards [:card :creator]]))]
    {:dashboard db})) ; why is this returned with this {:dashboard} wrapper?

(define-routes)
