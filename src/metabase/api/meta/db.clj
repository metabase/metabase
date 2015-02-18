(ns metabase.api.meta.db
  "/api/meta/db endpoints."
  (:require [compojure.core :refer [GET POST DELETE]]
            [korma.core :refer :all]
            [medley.core :as medley]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models common
                             [hydrate :refer [hydrate]]
                             [database :refer [Database]]
                             [org :refer [org-can-read org-can-write]]
                             [table :refer [Table]])))

(defendpoint GET "/" [org]
  (check-403 (org-can-read org))
  (-> (sel :many Database :organization_id org (order :name))
      (hydrate :organization)))

(defendpoint POST "/" [:as {{:keys [org] :as body} :body}]
  (check-403 (org-can-write org))
  (->> (-> body
           (select-keys [:name :engine :details])
           (assoc :organization_id org))
       (medley/mapply ins Database)))

(defendpoint GET "/form_input" []
  {:timezones metabase.models.common/timezones
   :engines driver/available-drivers})

(defendpoint GET "/:id" [id]
  (->404 (sel :one Database :id id)
         (hydrate :organization)))

(defendpoint DELETE "/:id" [id]
  (let-404 [{:keys [can_write]} (sel :one Database :id id)]
    (check-403 @can_write))
  (del Database :id id))

(defendpoint GET "/:id/tables" [id]
  (sel :many Table :db_id id (order :name)))

;; (defendpoint POST "/:id/sync" [id]
;;   {:status "TODO"})

(define-routes)
