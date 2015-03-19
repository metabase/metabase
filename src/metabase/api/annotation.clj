(ns metabase.api.annotation
  "`/api/annotation` endpoints."
  (:require [korma.core :as korma]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer :all]
            (metabase.models [annotation :refer [Annotation annotation-general annotation-description]]
                             [org :refer [Org]])
            [metabase.util :as util]))


;;; this is a remnant of the django app where the id in the database is keyed off an old django table :/
(def object-models {:table 33
                    :field 34})

(defannotation AnnotationObjectModel->ID
  "Check that param is a valid `object-models` key string (e.g., `\"table\"`), and return corresponding value (e.g., `33`)."
  [symb value :nillable]
  (-> (checkp-contains? (set (keys object-models)) symb (keyword value))
      object-models))

(defannotation AnnotationType [symb value :nillable]
  (annotation:IsInteger symb value)
  (checkp-contains? (set annotation-description annotation-general) symb value))


(defendpoint GET "/" [org object_model object_id]
  {org Required, object_model AnnotationObjectModel->ID}
  (read-check Org org)
  (-> (if (and object_model object_id)
        ;; caller wants annotations about a specific entity
        (sel :many Annotation :organization_id org :object_type_id object_model :object_id object_id (korma/order :start :DESC))
        ;; default is to return all annotations
        (sel :many Annotation :organization_id org (korma/order :start :DESC)))
      (hydrate :author)))


(defendpoint POST "/" [:as {{:keys [organization start end title body annotation_type object_model object_id]
                             :or {annotation_type annotation-general}
                             :as request-body} :body}]
  {organization    [Required IsInteger]
   start           [Required Date]
   end             [Required Date]
   body            [Required NonEmptyString]
   title           NonEmptyString
   annotation_type [Required AnnotationType]
   object_model    [Required AnnotationObjectModel->ID]
   object_id       [Required IsInteger]}
  ;; user only needs to be member of an organization (read perms) to be able to post annotations
  (read-check Org organization)
  (-> (ins Annotation
        :organization_id organization
        :author_id *current-user-id*
        :start start
        :end end
        :title title
        :body body
        :annotation_type annotation_type
        :object_type_id object_model
        :object_id object_id
        :edit_count 1)
    (hydrate :author)))


(defendpoint GET "/:id" [id]
  (let-404 [annotation (sel :one Annotation :id id)]
    (read-check Org (:organization_id annotation))
    (hydrate annotation :author)))


(defendpoint PUT "/:id" [id :as {{:keys [start end title body]} :body}]
  {start [Required Date]
   end   [Required Date]
   title [Required NonEmptyString]
   body  [Required NonEmptyString]}
  (let-404 [{:keys [edit_count] :as annotation} (sel :one Annotation :id id)]
    (read-check Org (:organization_id annotation))
    (check-500 (upd Annotation :id id
                    :start start
                    :end end
                    :title title
                    :body body
                    :edit_count (inc (or edit_count 0))))
    (sel :one Annotation :id id)))


(defendpoint DELETE "/:id" [id]
  (let-404 [annotation (sel :one Annotation :id id)]
    (read-check Org (:organization_id annotation))
    (del Annotation :id id)))


(define-routes)
