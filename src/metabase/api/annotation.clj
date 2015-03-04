(ns metabase.api.annotation
  (:require [korma.core :as korma]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer :all]
            (metabase.models [annotation :refer [Annotation]]
              [database :refer [Database databases-for-org]]
              [org :refer [Org]]
              [common :as common])
            [metabase.util :as util]))


(defendpoint GET "/" [org object_model object_id]
  (require-params org)
  (read-check Org org)
  (if (and object_model object_id)
    ;; caller wants annotations about a specific entity
    (-> (sel :many Annotation :organization_id org :object_type object_model :object_id object_id (korma/order :start :DESC))
      (hydrate :author))
    ;; default is to return all annotations
    (-> (sel :many Annotation :organization_id org (korma/order :start :DESC))
      (hydrate :author))))


(defendpoint POST "/" [:as {body :body}]
  (check-400 (util/contains-many? body :organization :start :end :title :body :annotation_type :object_type_id :object_id))
  ;; user only needs to be member of an organization (read perms) to be able to post annotations
  (read-check Org (:organization body))
  (check-500 (->> (-> body
                    (select-keys [:organization :title :body :annotation_type :object_type_id :object_id])
                    ;; NOTE - we need to parse string -> date
                    (assoc :start (util/parse-iso8601 (:start body)))
                    (assoc :end (util/parse-iso8601 (:end body)))
                    (clojure.set/rename-keys {:organization :organization_id} )
                    (assoc :author_id *current-user-id*)
                    (assoc :edit_count 1))
               (mapply ins Annotation))))


(defendpoint GET "/:id" [id]
  ;; TODO - permissions check
  (->404 (sel :one Annotation :id id)
    (hydrate :author)))


(defendpoint PUT "/:id" [id :as {body :body}]
  (check-400 (util/contains-many? body :start :end :title :body))
  (let-404 [annotation (sel :one Annotation :id id)]
    (check-500 (->> (-> body
                      (util/select-non-nil-keys :start :end :title :body)
                      ;; NOTE - we need to parse string -> date
                      (assoc :start (util/parse-iso8601 (:start body)))
                      (assoc :end (util/parse-iso8601 (:end body)))
                      (assoc :edit_count (inc (get annotation :edit_count 0))))
                 (mapply upd Annotation id)))
    (sel :one Annotation :id id)))


(defendpoint DELETE "/:id" [id]
  ;; TODO - permissions check
  (check-404 (exists? Annotation :id id))
  (del Annotation :id id)
  {:success true})


(define-routes)
