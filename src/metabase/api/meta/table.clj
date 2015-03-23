(ns metabase.api.meta.table
  "/api/meta/table endpoints."
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [GET POST PUT]]
            [korma.core :refer :all]
            [medley.core :as m]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer :all]
              [database :refer [Database]]
              [field :refer [Field]]
              [foreign-key :refer [ForeignKey]]
              [table :refer [Table] :as table])
            [metabase.util :as u]
            [metabase.driver :as driver]))

(defannotation TableEntityType [symb value :nillable]
  (checkp-contains? table/entity-types symb (keyword value)))

(defendpoint GET "/" [org]
  {org Required}
  (let [db-ids (sel :many :id Database :organization_id org)]
    (-> (sel :many Table :db_id [in db-ids] (order :name :ASC))
        (hydrate :db))))


(defendpoint GET "/:id" [id]
  (->404 (sel :one Table :id id)
         (hydrate :db :pk_field)))

(defendpoint PUT "/:id" [id :as {{:keys [entity_name entity_type description]} :body}]
  {entity_name NonEmptyString
   entity_type TableEntityType}
  (write-check Table id)
  (check-500 (upd-non-nil-keys Table id
                               :entity_name entity_name
                               :entity_type entity_type
                               :description description))
  (sel :one Table :id id))

(defendpoint GET "/:id/fields" [id]
  (sel :many Field :table_id id))

(defendpoint GET "/:id/query_metadata" [id]
  (->404 (sel :one Table :id id)
         (hydrate :db [:fields [:target]])))

(defendpoint GET "/:id/fks" [id]
  (read-check Table id)
  (let-404 [field-ids (sel :many :id Field :table_id id)]
    (-> (sel :many ForeignKey :destination_id [in field-ids])
        ;; TODO - it's a little silly to hydrate both of these table objects
        (hydrate [:origin :table] [:destination :table]))))

(defendpoint POST "/:id/sync" [id]
  (let-404 [table (sel :one Table :id id)]
    (write-check table)
    ;; run the task asynchronously
    (future (driver/sync-table table)))
  {:status :ok})

(defendpoint POST "/:id/reorder" [id :as {{:keys [new_order]} :body}]
  {new_order [Required ArrayOfIntegers]}
  (write-check Table id)
  (let [table-fields (sel :many Field :table_id id)]
    ;; run a function over the `new_order` list which simply updates `Field` :position to the index in the vector
    ;; NOTE: we assume that all `Fields` in the table are represented in the array
    (dorun
      (map-indexed
        (fn [index field-id]
          ;; this is a bit superfluous, but we force ourselves to match the supplied `new_order` field-id with an
          ;; actual `Field` value selected above in order to ensure people don't accidentally update fields they
          ;; aren't supposed to or aren't allowed to.  e.g. without this the caller could update any field-id they want
          (when-let [{:keys [id]} (first (filter #(= field-id (:id %)) table-fields))]
            (upd Field id :position index)))
        new_order))
    {:result "success"}))

;; TODO - GET /:id/segments
;; TODO - POST /:id/segments

(define-routes)
