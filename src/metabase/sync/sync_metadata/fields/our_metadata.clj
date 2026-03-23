(ns metabase.sync.sync-metadata.fields.our-metadata
  "Logic for constructing a map of metadata from the Metabase application database that matches the form of DB metadata
  about Fields in a Table, and for fetching the DB metadata itself. This metadata is used by the logic in other
  `metabase.sync.sync-metadata.fields.*` namespaces to determine what sync operations need to be performed by
  comparing the differences in the two sets of Metadata."
  (:require
   [medley.core :as m]
   [metabase.sync.interface :as i]
   [metabase.sync.persist :as persist]
   [metabase.sync.persist.appdb :as persist.appdb]
   [metabase.sync.sync-metadata.fields.common :as common]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         FETCHING OUR CURRENT METADATA                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- fields->parent-id->fields :- [:map-of common/ParentID [:set common/TableMetadataFieldWithID]]
  [fields :- [:maybe [:sequential i/FieldInstance]]]
  (->> (for [field fields]
         (merge
          {:parent-id                  (:parent_id field)
           :id                         (:id field)
           :name                       (:name field)
           :database-type              (:database_type field)
           :effective-type             (:effective_type field)
           :coercion-strategy          (:coercion_strategy field)
           :base-type                  (:base_type field)
           :semantic-type              (:semantic_type field)
           :field-comment              (:description field)
           :json-unfolding             (:json_unfolding field)
           :database-is-auto-increment (:database_is_auto_increment field)
           :position                   (:position field)
           :database-position          (:database_position field)
           :database-partitioned       (:database_partitioned field)
           :database-required          (:database_required field)
           :visibility-type            (:visibility_type field)
           :preview-display            (:preview_display field)}
          (u/remove-nils
           {:pk?                   (:database_is_pk field)
            :database-is-generated (:database_is_generated field)
            :database-is-nullable  (:database_is_nullable field)
            :database-default      (:database_default field)})))
       ;; make a map of parent-id -> set of child Fields
       (group-by :parent-id)
       ;; remove the parent ID because the Metadata from `describe-table` won't have it. Save the results as a set
       (m/map-vals (fn [fields]
                     (set (for [field fields]
                            (dissoc field :parent-id)))))))

(mu/defn- add-nested-fields :- common/TableMetadataFieldWithID
  "Recursively add entries for any nested-fields to `field`."
  [metabase-field    :- common/TableMetadataFieldWithID
   parent-id->fields :- [:map-of common/ParentID [:set common/TableMetadataFieldWithID]]]
  (let [nested-fields (get parent-id->fields (u/the-id metabase-field))]
    (if-not (seq nested-fields)
      metabase-field
      (assoc metabase-field :nested-fields (set (for [nested-field nested-fields]
                                                  (add-nested-fields nested-field parent-id->fields)))))))

(mu/defn fields->our-metadata :- [:set common/TableMetadataFieldWithID]
  "Given a sequence of Metabase Fields, format them and return them in a hierarchy so the format matches the one
  `db-metadata` comes back in."
  ([fields :- [:maybe [:sequential i/FieldInstance]]]
   (fields->our-metadata fields nil))

  ([fields :- [:maybe [:sequential i/FieldInstance]], top-level-parent-id :- common/ParentID]
   (let [parent-id->fields (fields->parent-id->fields fields)]
     ;; get all the top-level fields, then call `add-nested-fields` to recursively add the fields
     (set (for [metabase-field (get parent-id->fields top-level-parent-id)]
            (add-nested-fields metabase-field parent-id->fields))))))

(mu/defn- table->fields :- [:maybe [:sequential i/FieldInstance]]
  "Fetch active Fields from the Metabase application database for a given `table`."
  ([table :- i/TableInstance]
   (table->fields table persist.appdb/reader))
  ([table  :- i/TableInstance
    reader :- [:fn #(satisfies? persist/SyncDatabaseReader %)]]
   (persist/active-fields reader (u/the-id table))))

(mu/defn our-metadata :- [:set common/TableMetadataFieldWithID]
  "Return information we have about Fields for a `table` in the application database in (almost) exactly the same
   `TableMetadataField` format returned by `describe-table`."
  ([table :- i/TableInstance]
   (our-metadata table persist.appdb/reader))
  ([table  :- i/TableInstance
    reader :- [:fn #(satisfies? persist/SyncDatabaseReader %)]]
   (-> (table->fields table reader) fields->our-metadata)))
