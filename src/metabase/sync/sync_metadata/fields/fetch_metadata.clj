(ns metabase.sync.sync-metadata.fields.fetch-metadata
  "Logic for constructing a map of metadata from the Metabase application database that matches the form of DB metadata
  about Fields in a Table, and for fetching the DB metadata itself. This metadata is used by the logic in other
  `metabase.sync.sync-metadata.fields.*` namespaces to determine what sync operations need to be performed by
  comparing the differences in the two sets of Metadata."
  (:require [medley.core :as m]
            [metabase.models
             [field :as field :refer [Field]]
             [table :as table]]
            [metabase.sync
             [fetch-metadata :as fetch-metadata]
             [interface :as i]]
            [metabase.sync.sync-metadata.fields.common :as common]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         FETCHING OUR CURRENT METADATA                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private fields->parent-id->fields :- {common/ParentID #{common/TableMetadataFieldWithID}}
  [fields :- (s/maybe [i/FieldInstance])]
  (->> (for [field fields]
         {:parent-id         (:parent_id field)
          :id                (:id field)
          :name              (:name field)
          :database-type     (:database_type field)
          :base-type         (:base_type field)
          :special-type      (:special_type field)
          :pk?               (isa? (:special_type field) :type/PK)
          :field-comment     (:description field)
          :database-position (:database_position field)})
       ;; make a map of parent-id -> set of child Fields
       (group-by :parent-id)
       ;; remove the parent ID because the Metadata from `describe-table` won't have it. Save the results as a set
       (m/map-vals (fn [fields]
                     (set (for [field fields]
                            (dissoc field :parent-id)))))))

(s/defn ^:private add-nested-fields :- common/TableMetadataFieldWithID
  "Recursively add entries for any nested-fields to `field`."
  [metabase-field    :- common/TableMetadataFieldWithID
   parent-id->fields :- {common/ParentID #{common/TableMetadataFieldWithID}}]
  (let [nested-fields (get parent-id->fields (u/get-id metabase-field))]
    (if-not (seq nested-fields)
      metabase-field
      (assoc metabase-field :nested-fields (set (for [nested-field nested-fields]
                                                  (add-nested-fields nested-field parent-id->fields)))))))

(s/defn fields->our-metadata :- #{common/TableMetadataFieldWithID}
  "Given a sequence of Metabase Fields, format them and return them in a hierachy so the format matches the one
  `db-metadata` comes back in."
  ([fields :- (s/maybe [i/FieldInstance])]
   (fields->our-metadata fields nil))

  ([fields :- (s/maybe [i/FieldInstance]), top-level-parent-id :- common/ParentID]
   (let [parent-id->fields (fields->parent-id->fields fields)]
     ;; get all the top-level fields, then call `add-nested-fields` to recursively add the fields
     (set (for [metabase-field (get parent-id->fields top-level-parent-id)]
            (add-nested-fields metabase-field parent-id->fields))))))

(s/defn ^:private table->fields :- [i/FieldInstance]
  "Fetch active Fields from the Metabase application database for a given `table`."
  [table :- i/TableInstance]
  (db/select [Field :name :database_type :base_type :special_type :parent_id :id :description :database_position]
    :table_id  (u/get-id table)
    :active    true
    {:order-by (table/field-order-rule table)}))

(s/defn our-metadata :- #{common/TableMetadataFieldWithID}
  "Return information we have about Fields for a `table` in the application database in (almost) exactly the same
   `TableMetadataField` format returned by `describe-table`."
  [table :- i/TableInstance]
  (-> table table->fields fields->our-metadata))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      FETCHING METADATA FROM CONNECTED DB                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn db-metadata :- #{i/TableMetadataField}
  "Fetch metadata about Fields belonging to a given TABLE directly from an external database by calling its
   driver's implementation of `describe-table`."
  [database :- i/DatabaseInstance, table :- i/TableInstance]
  (:fields (fetch-metadata/table-metadata database table)))
