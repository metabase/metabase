(ns metabase.api.table
  "/api/table endpoints."
  (:require [compojure.core :refer [GET POST PUT]]
            [korma.core :as k]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer :all]
                             [database :refer [Database]]
                             [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table] :as table])
            [metabase.driver :as driver]))

(defannotation TableEntityType
  "Param must be one of `person`, `event`, `photo`, or `place`."
  [symb value :nillable]
  (checkp-contains? table/entity-types symb (keyword value)))

(defannotation TableVisibilityType
  "Param must be one of `hidden`, `technical`, or `cruft`."
  [symb value :nillable]
  (checkp-contains? table/visibility-types symb (keyword value)))

(defendpoint GET "/"
  "Get all `Tables`."
  []
  (-> (sel :many Table :active true (k/order :name :ASC))
      (hydrate :db)
      ;; if for some reason a Table doesn't have rows set then set it to 0 so UI doesn't barf
      (#(map (fn [table]
               (cond-> table
                 (not (:rows table)) (assoc :rows 0)))
         %))))

(defendpoint GET "/:id"
  "Get `Table` with ID."
  [id]
  (->404 (Table id)
         read-check
         (hydrate :db :pk_field)))

(defendpoint PUT "/:id"
  "Update `Table` with ID."
  [id :as {{:keys [display_name entity_type visibility_type description]} :body}]
  {display_name    NonEmptyString,
   entity_type     TableEntityType,
   visibility_type TableVisibilityType}
  (write-check Table id)
  (check-500 (upd-non-nil-keys Table id
                               :display_name    display_name
                               :entity_type     entity_type
                               :description     description))
  (check-500 (upd Table id :visibility_type visibility_type))
  (Table id))

(defendpoint GET "/:id/fields"
  "Get all `Fields` for `Table` with ID."
  [id]
  (read-check Table id)
  (sel :many Field :table_id id, :active true, :field_type [not= "sensitive"], (k/order :name :ASC)))

(defendpoint GET "/:id/query_metadata"
  "Get metadata about a `Table` useful for running queries.
   Returns DB, fields, field FKs, and field values.

  By passing `include_sensitive_fields=true`, information *about* sensitive `Fields` will be returned; in no case
  will any of its corresponding values be returned. (This option is provided for use in the Admin Edit Metadata page)."
  [id include_sensitive_fields]
  {include_sensitive_fields String->Boolean}
  (->404 (Table id)
         read-check
         (hydrate :db [:fields :target] :field_values :segments :metrics)
         (update-in [:fields] (if include_sensitive_fields
                                ;; If someone passes include_sensitive_fields return hydrated :fields as-is
                                identity
                                ;; Otherwise filter out all :sensitive fields
                                (partial filter (fn [{:keys [field_type]}]
                                                  (not= (keyword field_type) :sensitive)))))))

(defendpoint GET "/:id/fks"
  "Get all `ForeignKeys` whose destination is a `Field` that belongs to this `Table`."
  [id]
  (read-check Table id)
  (let-404 [field-ids (sel :many :id Field :table_id id :active true)]
    (-> (sel :many ForeignKey :destination_id [in field-ids])
        ;; TODO - it's a little silly to hydrate both of these table objects
        (hydrate [:origin [:table :db]] [:destination :table]))))

(defendpoint POST "/:id/sync"
  "Re-sync the metadata for this `Table`."
  [id]
  (let-404 [table (Table id)]
    (write-check table)
    ;; run the task asynchronously
    (future (driver/sync-table! table)))
  {:status :ok})

(defendpoint POST "/:id/reorder"
  "Re-order the `Fields` belonging to this `Table`."
  [id :as {{:keys [new_order]} :body}]
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

(define-routes)
