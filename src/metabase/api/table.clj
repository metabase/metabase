(ns metabase.api.table
  "/api/table endpoints."
  (:require [compojure.core :refer [GET POST PUT]]
            [schema.core :as s]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            [metabase.driver :as driver]
            (metabase.models [field :refer [Field]]
                             [hydrate :refer :all]
                             [interface :as models]
                             [table :refer [Table] :as table])
            [metabase.sync-database :as sync-database]
            [metabase.util.schema :as su]))

(def ^:private TableEntityType
  "Schema for a valid table entity type."
  (apply s/enum (map name table/entity-types)))

(def ^:private TableVisibilityType
  "Schema for a valid table visibility type."
  (apply s/enum (map name table/visibility-types)))

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
  {display_name    (s/maybe su/NonBlankString)
   entity_type     (s/maybe TableEntityType)
   visibility_type (s/maybe TableVisibilityType)}
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


(defendpoint GET "/:id/query_metadata"
  "Get metadata about a `Table` useful for running queries.
   Returns DB, fields, field FKs, and field values.

  By passing `include_sensitive_fields=true`, information *about* sensitive `Fields` will be returned; in no case
  will any of its corresponding values be returned. (This option is provided for use in the Admin Edit Metadata page)."
  [id include_sensitive_fields]
  {include_sensitive_fields (s/maybe su/BooleanString)}
  (-> (read-check Table id)
      (hydrate :db [:fields :target] :field_values :segments :metrics)
      (update-in [:fields] (if (Boolean/parseBoolean include_sensitive_fields)
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


(define-routes)
