(ns metabase.api.label
  "`/api/label` endpoints."
  (:require [compojure.core :refer [GET POST DELETE PUT]]
            [metabase.api.common :refer [defendpoint define-routes write-check]]
            [metabase.db :as db]
            [metabase.models.label :refer [Label]]))

(defendpoint GET "/"
  "List all `Labels`. :label:"
  []
  (db/select Label {:order-by [:%lower.name]}))

(defendpoint POST "/"
  "Create a new `Label`. :label: "
  [:as {{:keys [name icon]} :body}]
  {name [Required NonEmptyString]
   icon NonEmptyString}
  (db/insert! Label, :name name, :icon icon))

(defendpoint PUT "/:id"
  "Update a `Label`. :label:"
  [id :as {{:keys [name icon], :as body} :body}]
  {name NonEmptyString
   icon NonEmptyString}
  (write-check Label id)
  (db/update! Label id body)
  (Label id)) ; return the updated Label

(defendpoint DELETE "/:id"
  "Delete a `Label`. :label:"
  [id]
  (write-check Label id)
  (db/cascade-delete! Label :id id))

(define-routes)
