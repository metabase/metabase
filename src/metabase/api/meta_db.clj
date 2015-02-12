(ns metabase.api.meta-db
  "/api/meta/db endpoints.")
(metabase.require/api)

(defendpoint GET "/" [org]
  (sel :many Database :organization_id org))

(defendpoint GET "/:id" [id]
  (->404 (sel :one Database :id id)
         (hydrate :organization)))

(defendpoint GET "/:id/tables" [id]
  (sel :many Table :db_id id))

(define-routes)
