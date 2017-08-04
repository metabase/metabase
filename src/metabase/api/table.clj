(ns metabase.api.table
  "/api/table endpoints."
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [GET PUT]]
            [medley.core :as m]
            [metabase
             [sync :as sync]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.models
             [card :refer [Card]]
             [database :as database]
             [field :refer [Field with-normal-values]]
             [field-values :as fv]
             [interface :as mi]
             [table :as table :refer [Table]]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

;; TODO - I don't think this is used for anything any more
(def ^:private ^:deprecated TableEntityType
  "Schema for a valid table entity type."
  (apply s/enum (map name table/entity-types)))

(def ^:private TableVisibilityType
  "Schema for a valid table visibility type."
  (apply s/enum (map name table/visibility-types)))

(api/defendpoint GET "/"
  "Get all `Tables`."
  []
  (for [table (-> (db/select Table, :active true, {:order-by [[:name :asc]]})
                  (hydrate :db))
        :when (mi/can-read? table)]
    ;; if for some reason a Table doesn't have rows set then set it to 0 so UI doesn't barf. TODO - should that be part of `post-select` instead?
    (update table :rows (fn [n]
                          (or n 0)))))

(api/defendpoint GET "/:id"
  "Get `Table` with ID."
  [id]
  (-> (api/read-check Table id)
      (hydrate :db :pk_field)))


(api/defendpoint PUT "/:id"
  "Update `Table` with ID."
  [id :as {{:keys [display_name entity_type visibility_type description caveats points_of_interest show_in_getting_started], :as body} :body}]
  {display_name            (s/maybe su/NonBlankString)
   entity_type             (s/maybe TableEntityType)
   visibility_type         (s/maybe TableVisibilityType)
   description             (s/maybe su/NonBlankString)
   caveats                 (s/maybe su/NonBlankString)
   points_of_interest      (s/maybe su/NonBlankString)
   show_in_getting_started (s/maybe s/Bool)}
  (api/write-check Table id)
  (let [original-visibility-type (db/select-one-field :visibility_type Table :id id)]
    ;; always update visibility type; update display_name, show_in_getting_started, entity_type if non-nil; update description and related fields if passed in
    (api/check-500
     (db/update! Table id
       (assoc (u/select-keys-when body
                :non-nil [:display_name :show_in_getting_started :entity_type]
                :present [:description :caveats :points_of_interest])
         :visibility_type visibility_type)))
    (let [updated-table   (Table id)
          now-visible?    (nil? (:visibility_type updated-table)) ; only Tables with `nil` visibility type are visible
          was-visible?    (nil? original-visibility-type)
          became-visible? (and now-visible? (not was-visible?))]
      (when became-visible?
        (log/info (u/format-color 'green "Table '%s' is now visible. Resyncing." (:name updated-table)))
        (sync/sync-table! updated-table))
      updated-table)))


(defn- format-fields-for-response [resp]
  (update resp :fields
          (fn [fields]
            (for [{:keys [values] :as field} fields]
              (if (seq values)
                (update field :values fv/field-values->pairs)
                field)))))

(api/defendpoint GET "/:id/query_metadata"
  "Get metadata about a `Table` useful for running queries.
   Returns DB, fields, field FKs, and field values.

  By passing `include_sensitive_fields=true`, information *about* sensitive `Fields` will be returned; in no case
  will any of its corresponding values be returned. (This option is provided for use in the Admin Edit Metadata page)."
  [id include_sensitive_fields]
  {include_sensitive_fields (s/maybe su/BooleanString)}
  (-> (api/read-check Table id)
      (hydrate :db [:fields :target :dimensions] :segments :metrics)
      (update :fields with-normal-values)
      (m/dissoc-in [:db :details])
      format-fields-for-response
      (update-in [:fields] (if (Boolean/parseBoolean include_sensitive_fields)
                             ;; If someone passes include_sensitive_fields return hydrated :fields as-is
                             identity
                             ;; Otherwise filter out all :sensitive fields
                             (partial filter (fn [{:keys [visibility_type]}]
                                               (not= (keyword visibility_type) :sensitive)))))))

(defn- card-result-metadata->virtual-fields
  "Return a sequence of 'virtual' fields metadata for the 'virtual' table for a Card in the Saved Questions 'virtual' database."
  [card-id metadata]
  (for [col metadata]
    (assoc col
      :table_id     (str "card__" card-id)
      :id           [:field-literal (:name col) (or (:base_type col) :type/*)]
      ;; don't return :special_type if it's a PK or FK because it confuses the frontend since it can't actually be used that way IRL
      :special_type (when-let [special-type (keyword (:special_type col))]
                      (when-not (or (isa? special-type :type/PK)
                                    (isa? special-type :type/FK))
                        special-type)))))

(defn card->virtual-table
  "Return metadata for a 'virtual' table for a CARD in the Saved Questions 'virtual' database. Optionally include 'virtual' fields as well."
  [card & {:keys [include-fields?]}]
  ;; if collection isn't already hydrated then do so
  (let [card (hydrate card :colllection)]
    (cond-> {:id           (str "card__" (u/get-id card))
             :db_id        database/virtual-id
             :display_name (:name card)
             :schema       (get-in card [:collection :name] "Everything else")
             :description  (:description card)}
      include-fields? (assoc :fields (card-result-metadata->virtual-fields (u/get-id card) (:result_metadata card))))))

(api/defendpoint GET "/card__:id/query_metadata"
  "Return metadata for the 'virtual' table for a Card."
  [id]
  (-> (db/select-one [Card :id :dataset_query :result_metadata :name :description :collection_id], :id id)
      api/read-check
      (card->virtual-table :include-fields? true)))

(api/defendpoint GET "/card__:id/fks"
  "Return FK info for the 'virtual' table for a Card. This is always empty, so this endpoint
   serves mainly as a placeholder to avoid having to change anything on the frontend."
  []
  []) ; return empty array


(api/defendpoint GET "/:id/fks"
  "Get all foreign keys whose destination is a `Field` that belongs to this `Table`."
  [id]
  (api/read-check Table id)
  (when-let [field-ids (seq (db/select-ids Field, :table_id id, :visibility_type [:not= "retired"], :active true))]
    (for [origin-field (db/select Field, :fk_target_field_id [:in field-ids], :active true)]
      ;; it's silly to be hydrating some of these tables/dbs
      {:relationship   :Mt1
       :origin_id      (:id origin-field)
       :origin         (hydrate origin-field [:table :db])
       :destination_id (:fk_target_field_id origin-field)
       :destination    (hydrate (Field (:fk_target_field_id origin-field)) :table)})))


(api/define-routes)
