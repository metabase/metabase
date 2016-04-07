(ns metabase.api.label
  "`/api/label` endpoints."
  (:require [compojure.core :refer [GET POST DELETE PUT]]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.api.common :refer [defendpoint define-routes write-check]]
            [metabase.db :as db]
            [metabase.models.label :refer [Label]]))

(defendpoint GET "/"
  "List all labels."
  []
  (db/sel :many Label (k/order (k/sqlfn :LOWER :name))))

(defendpoint POST "/"
  "Create a new label."
  [:as {{label-name :name, icon :icon} :body}]
  {label-name [Required NonEmptyString]
   icon       NonEmptyString}
  (db/ins Label, :name label-name, :icon icon))

(defendpoint PUT "/:id"
  "Update a label."
  [id :as {{label-name :name, icon :icon, :as body} :body}]
  {label-name NonEmptyString
   icon       NonEmptyString}
  (write-check Label id)
  (m/mapply db/upd Label id body)
  (Label id)) ; return the updated Label

(defendpoint DELETE "/:id"
  "Delete a label."
  [id]
  (write-check Label id)
  (db/cascade-delete Label :id id))

(define-routes)
