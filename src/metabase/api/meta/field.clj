(ns metabase.api.meta.field
  (:require [compojure.core :refer [GET PUT POST]]
            [medley.core :as medley]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [hydrate :refer [hydrate]]
                             [field :refer [Field] :as field]
                             [foreign-key :refer [ForeignKey] :as fk])
            [metabase.util :as u]))

(defannotation FieldSpecialType [symb value :nillable]
  (checkp-contains? field/special-types symb (keyword value)))

(defannotation FieldType [symb value :nillable]
  (checkp-contains? field/field-types symb (keyword value)))

(defannotation ForeignKeyRelationship [symb value :nillable]
  (checkp-contains? fk/relationships symb (keyword value)))

(defendpoint GET "/:id" [id]
  (->404 (sel :one Field :id id)
         read-check
         (hydrate [:table :db])))

(defendpoint PUT "/:id" [id :as {{:keys [special_type preview_display description]} :body}]
  {special_type FieldSpecialType
   ;; TODO - base_type ??
   }
  (write-check Field id)
  (check-500 (upd-non-nil-keys Field id
               :special_type    special_type
               :preview_display preview_display
               :description     description))
  (sel :one Field :id id))

(defendpoint GET "/:id/summary" [id]
  (let-404 [field (sel :one Field :id id)]
    (read-check field)
    [[:count (driver/field-count field)]
     [:distincts (driver/field-distinct-count field)]]))


(defendpoint GET "/:id/foreignkeys" [id]
  (read-check Field id)
  (-> (sel :many ForeignKey :origin_id id)
      (hydrate [:origin :table] [:destination :table])))


(defendpoint POST "/:id/foreignkeys" [id :as {{:keys [target_field relationship]} :body}]
  {target_field Required
   relationship [Required ForeignKeyRelationship]}
  (write-check Field id)
  (write-check Field target_field)
  (-> (ins ForeignKey
        :origin_id id
        :destination_id target_field
        :relationship relationship)
    (hydrate [:origin :table] [:destination :table])))


;; ## TODO - Endpoints not yet implemented
;; (defendpoint GET "/:id/values" [id])

(define-routes)
