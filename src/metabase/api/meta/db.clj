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
                             [table :refer [Table]])))

(defendpoint GET "/" [org]
  (-> (sel :many Database :organization_id org (order :name))
      (hydrate :organization)))

(defendpoint POST "/" [:as {{:keys [org] :as body} :body}]
  (check-org-admin org)
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
  (let-404 [{:keys [organization_id]} (sel :one [Database :organization_id] :id id)]
    (check-org-admin organization_id))
  (del Database :id id))

(defendpoint GET "/:id/tables" [id]
  (sel :many Table :db_id id (order :name)))

(define-routes)
