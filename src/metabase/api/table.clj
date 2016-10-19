(ns metabase.api.table
  "/api/table endpoints."
  (:require [compojure.core :refer [GET POST PUT]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            [metabase.driver :as driver]
            (metabase.models [field :refer [Field]]
                             [hydrate :refer :all]
                             [interface :as models]
                             [table :refer [Table] :as table])
            [metabase.sync-database :as sync-database]))

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
  (for [table (-> (db/select Table, :active true, {:order-by [[:name :asc]]})
                  (hydrate :db))
        :when (models/can-read? table)]
    ;; if for some reason a Table doesn't have rows set then set it to 0 so UI doesn't barf. TODO - should that be part of `post-select` instead?
    (update table :rows (fn [n]
                          (or n 0)))))

(defendpoint GET "/:id"
  "Get `Table` with ID."
  [id]
  (-> (read-check Table id)
      (hydrate :db :pk_field)))

(defendpoint PUT "/:id"
  "Update `Table` with ID."
  [id :as {{:keys [display_name entity_type visibility_type description caveats points_of_interest show_in_getting_started]} :body}]
  {display_name    NonEmptyString
   entity_type     TableEntityType
   visibility_type TableVisibilityType}
  (write-check Table id)
  (check-500 (db/update-non-nil-keys! Table id
               :display_name            display_name
               :caveats                 caveats
               :points_of_interest      points_of_interest
               :show_in_getting_started show_in_getting_started
               :entity_type             entity_type
               :description             description))
  (check-500 (db/update! Table id, :visibility_type visibility_type))
  (Table id))

(defendpoint GET "/:id/fields"
  "Get all `Fields` for `Table` with ID."
  [id]
  (read-check Table id)
  (db/select Field, :table_id id, :visibility_type [:not-in ["sensitive" "retired"]], {:order-by [[:name :asc]]}))

(defendpoint GET "/:id/query_metadata"
  "Get metadata about a `Table` useful for running queries.
   Returns DB, fields, field FKs, and field values.

  By passing `include_sensitive_fields=true`, information *about* sensitive `Fields` will be returned; in no case
  will any of its corresponding values be returned. (This option is provided for use in the Admin Edit Metadata page)."
  [id include_sensitive_fields]
  {include_sensitive_fields String->Boolean}
  (-> (read-check Table id)
      (hydrate :db [:fields :target] :field_values :segments :metrics)
      (update-in [:fields] (if include_sensitive_fields
                             ;; If someone passes include_sensitive_fields return hydrated :fields as-is
                             identity
                             ;; Otherwise filter out all :sensitive fields
                             (partial filter (fn [{:keys [visibility_type]}]
                                               (not= (keyword visibility_type) :sensitive)))))))

(defendpoint GET "/:id/fks"
  "Get all foreign keys whose destination is a `Field` that belongs to this `Table`."
  [id]
  (read-check Table id)
  (let [field-ids (db/select-ids Field, :table_id id, :visibility_type [:not= "retired"])]
    (when (seq field-ids)
      (for [origin-field (db/select Field, :fk_target_field_id [:in field-ids])]
        ;; it's silly to be hydrating some of these tables/dbs
        {:relationship   :Mt1
         :origin_id      (:id origin-field)
         :origin         (hydrate origin-field [:table :db])
         :destination_id (:fk_target_field_id origin-field)
         :destination    (hydrate (Field (:fk_target_field_id origin-field)) :table)}))))

;; TODO - Not sure this is used anymore
;; TODO - shouldn't you have to be admin to re-sync a table?
(defendpoint POST "/:id/sync"
  "Re-sync the metadata for this `Table`. This is ran asynchronously; the endpoint returns right away."
  [id]
  (future (sync-database/sync-table! (write-check Table id)))
  {:status :ok})

(defendpoint POST "/:id/reorder"
  "Re-order the `Fields` belonging to this `Table`."
  [id :as {{:keys [new_order]} :body}]
  {new_order [Required ArrayOfIntegers]}
  (write-check Table id)
  (let [table-fields (db/select Field, :table_id id)]
    ;; run a function over the `new_order` list which simply updates `Field` :position to the index in the vector
    ;; NOTE: we assume that all `Fields` in the table are represented in the array
    (dorun
     (map-indexed
      (fn [index field-id]
        ;; this is a bit superfluous, but we force ourselves to match the supplied `new_order` field-id with an
        ;; actual `Field` value selected above in order to ensure people don't accidentally update fields they
        ;; aren't supposed to or aren't allowed to.  e.g. without this the caller could update any field-id they want
        (when-let [{:keys [id]} (first (filter #(= field-id (:id %)) table-fields))]
          (db/update! Field id, :position index)))
      new_order))
    {:result "success"}))

(define-routes)
