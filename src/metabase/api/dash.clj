(ns metabase.api.dash
  "/api/meta/dash endpoints."
  (:require [compojure.core :refer [GET POST]]
            [medley.core :as medley]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [dashboard :refer [Dashboard]])))

(defendpoint GET "/" [org f] ; TODO - what to do with f ?
  (-> (sel :many Dashboard :organization_id org)
      (hydrate :creator :organization)))

(defendpoint POST "/" [:as {:keys [body]}]
  (let [{:keys [organization]} body]
    (check-403 (org-perms-case organization ; check that current-user can make a Dashboard for this org
                 :admin true
                 :default true
                 nil false))
    (->> (-> body
             (select-keys [:organization :name :public_perms])
             (clojure.set/rename-keys {:organization :organization_id})
             (assoc :creator_id *current-user-id*))
         (medley/mapply ins Dashboard))))

(defendpoint GET "/:id" [id]
  (let-404 [db (-> (sel :one Dashboard :id id)
                   (hydrate :creator :organization [:ordered_cards [:card :creator]]))]
    {:dashboard db})) ; why is this returned with this {:dashboard} wrapper?

(define-routes)
