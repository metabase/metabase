(ns metabase.api.meta-table
  "/api/meta/table endpoints.")
(metabase.require/api)

(defendpoint GET "/:id" [id]
  (->404 (sel :one Table :id id)
         (hydrate :db)))

(defendpoint GET "/:id/fields" [id]
  (sel :many Field :table_id id))

(defendpoint GET "/:id/query_metadata" [id]
  (->404 (sel :one Table :id id)
         (hydrate :db :fields)))

(defendpoint GET "/" [org]
  (let [db-ids (->> (sel :many [Database :id] :organization_id org)
                    (map :id))]
    (-> (sel :many Table :db_id [in db-ids] (order :name :ASC))
        (simple-batched-hydrate Database :db_id :db))))


(define-routes)
