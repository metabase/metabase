(ns metabase.sync.sync-metadata.fields.sync-instances
  "Logic for syncing the instances of `Field` in the Metabase application DB with the set of Fields in the DB metadata.
  Responsible for creating new instances of `Field` as needed, and marking existing ones as active or inactive as
  needed. Recursively handles nested Fields.

  All nested Fields recursion is handled in one place, by the main entrypoint (`sync-instances!`) and helper
  functions `sync-nested-field-instances!` and `sync-nested-fields-of-one-field!`. All other functions in this
  namespace should ignore nested fields entirely; the will be invoked with those Fields as appropriate."
  (:require
   [medley.core :as m]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.humanization :as humanization]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata.fields.common :as common]
   [metabase.sync.sync-metadata.fields.fetch-metadata :as fetch-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         CREATING / REACTIVATING FIELDS                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn ^:private matching-inactive-fields :- [:maybe [:sequential i/FieldInstance]]
  "Return inactive Metabase Fields that match any of the Fields described by `new-field-metadatas`, if any such Fields
  exist."
  [table               :- i/TableInstance
   new-field-metadatas :- [:maybe [:sequential i/TableMetadataField]]
   parent-id           :- common/ParentID]
  (when (seq new-field-metadatas)
    (t2/select     Field
      :table_id    (u/the-id table)
      :%lower.name [:in (map common/canonical-name new-field-metadatas)]
      :parent_id   parent-id
      :active      false)))

(mu/defn ^:private insert-new-fields! :- [:maybe [:sequential ::lib.schema.id/field]]
  "Insert new Field rows for for all the Fields described by `new-field-metadatas`. Returns IDs of newly inserted
  Fields."
  [table               :- i/TableInstance
   new-field-metadatas :- [:maybe [:sequential i/TableMetadataField]]
   parent-id           :- common/ParentID]
  (when (seq new-field-metadatas)
    (t2/insert-returning-pks! Field
      (for [{:keys [database-type database-is-auto-increment database-required base-type effective-type coercion-strategy
                    field-comment database-position nfc-path visibility-type json-unfolding]
             field-name :name :as field} new-field-metadatas]
        (do
          (when (and effective-type
                     base-type
                     (not= effective-type base-type)
                     (nil? coercion-strategy))
            (log/warn (u/format-color 'red
                                      (str
                                       "WARNING: Field `%s`: effective type `%s` provided but no coercion strategy provided."
                                       " Using base-type: `%s`")
                                      field-name
                                      effective-type
                                      base-type)))
          {:table_id                   (u/the-id table)
           :name                       field-name
           :display_name               (humanization/name->human-readable-name field-name)
           :database_type              (or database-type "NULL") ; placeholder for Fields w/ no type info (e.g. Mongo) & all NULL
           :base_type                  base-type
           ;; todo test this?
           :effective_type             (if (and effective-type coercion-strategy) effective-type base-type)
           :coercion_strategy          (when effective-type coercion-strategy)
           :semantic_type              (common/semantic-type field)
           :parent_id                  parent-id
           :nfc_path                   nfc-path
           :description                field-comment
           :position                   database-position
           :database_position          database-position
           :json_unfolding             (or json-unfolding false)
           :database_is_auto_increment (or database-is-auto-increment false)
           :database_required          (or database-required false)
           :visibility_type            (or visibility-type :normal)})))))

(mu/defn ^:private create-or-reactivate-fields! :- [:maybe [:sequential i/FieldInstance]]
  "Create (or reactivate) Metabase Field object(s) for any Fields in `new-field-metadatas`. Does *NOT* recursively
  handle nested Fields."
  [table               :- i/TableInstance
   new-field-metadatas :- [:maybe [:sequential i/TableMetadataField]]
   parent-id           :- common/ParentID]
  (let [fields-to-reactivate (matching-inactive-fields table new-field-metadatas parent-id)]
    ;; if the fields already exist but were just marked inactive then reäctivate them
    (when (seq fields-to-reactivate)
      (t2/update! Field {:id [:in (map u/the-id fields-to-reactivate)]}
                  {:active true}))
    (let [reactivated?  (comp (set (map common/canonical-name fields-to-reactivate))
                              common/canonical-name)
          ;; If we reactivated the fields, no need to insert them; insert new rows for any that weren't reactivated
          new-field-ids (insert-new-fields! table (remove reactivated? new-field-metadatas) parent-id)]
      ;; now return the newly created or reactivated Fields
      (when-let [new-and-updated-fields (seq (map u/the-id (concat fields-to-reactivate new-field-ids)))]
        (t2/select Field :id [:in new-and-updated-fields])))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                          SYNCING INSTANCES OF 'ACTIVE' FIELDS (FIELDS IN DB METADATA)                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private Updates
  "Schema for the value returned by `sync-active-instances!`. Because we need to know about newly-inserted/reactivated
  parent Fields when recursively syncing nested Fields, we need to propogate the updates to `our-metadata` made by
  this function and pass them to other steps of the `sync-instances!` process."
  [:map
   [:num-updates  ms/IntGreaterThanOrEqualToZero]
   [:our-metadata [:set common/TableMetadataFieldWithID]]])

(mu/defn ^:private sync-active-instances! :- Updates
  "Sync instances of `Field` in the application database with 'active' Fields in the DB being synced (i.e., ones that
  are returned as part of the `db-metadata`). Creates or reactivates Fields as needed. Returns number of Fields
  synced and updated `our-metadata` including the new Fields and their IDs."
  [table        :- i/TableInstance
   db-metadata  :- [:set i/TableMetadataField]
   our-metadata :- [:set common/TableMetadataFieldWithID]
   parent-id    :- common/ParentID]
  (let [known-fields (m/index-by common/canonical-name our-metadata)
        our-metadata (atom our-metadata)]
    {:num-updates
     ;; Field sync logic below is broken out into chunks of 1000 fields for huge star schemas or other situations
     ;; where we don't want to be updating way too many rows at once
     (sync-util/sum-for [db-field-chunk (partition-all 1000 db-metadata)]
       (sync-util/with-error-handling (format "Error checking if Fields %s need to be created or reactivated"
                                              (pr-str (map :name db-field-chunk)))
        (let [known-field?        (comp known-fields common/canonical-name)
              new-fields          (remove known-field? db-field-chunk)
              new-field-instances (create-or-reactivate-fields! table new-fields parent-id)]
          ;; save any updates to `our-metadata`
          (swap! our-metadata into (fetch-metadata/fields->our-metadata new-field-instances parent-id))
          ;; now return count of rows updated
          (count new-fields))))

     :our-metadata
     @our-metadata}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           "RETIRING" INACTIVE FIELDS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn ^:private retire-field! :- [:maybe [:= 1]]
  "Mark an `old-field` belonging to `table` as inactive if corresponding Field object exists. Does *NOT* recurse over
  nested Fields. Returns `1` if a Field was marked inactive, `nil` otherwise."
  [table          :- i/TableInstance
   metabase-field :- common/TableMetadataFieldWithID]
  (log/infof "Marking Field ''%s'' as inactive." (common/field-metadata-name-for-logging table metabase-field))
  (when (pos? (t2/update! Field (u/the-id metabase-field) {:active false}))
    1))

(mu/defn ^:private retire-fields! :- ms/IntGreaterThanOrEqualToZero
  "Mark inactive any Fields in the application database that are no longer present in the DB being synced. These
  Fields are ones that are in `our-metadata`, but not in `db-metadata`. Does *NOT* recurse over nested Fields.
  Returns `1` if a Field was marked inactive."
  [table        :- i/TableInstance
   db-metadata  :- [:set i/TableMetadataField]
   our-metadata :- [:set common/TableMetadataFieldWithID]]
  ;; retire all the Fields not present in `db-metadata`, and count how many rows were actually affected
  (sync-util/sum-for [metabase-field our-metadata
                      :when          (not (common/matching-field-metadata metabase-field db-metadata))]
    (sync-util/with-error-handling (format "Error retiring %s"
                                           (common/field-metadata-name-for-logging table metabase-field))
      (retire-field! table metabase-field))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                  HIGH-LEVEL INSTANCE SYNCING LOGIC (CREATING/REACTIVATING/RETIRING/UPDATING)                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(declare sync-instances!)

(mu/defn ^:private sync-nested-fields-of-one-field! :- [:maybe ms/IntGreaterThanOrEqualToZero]
  "Recursively sync Field instances (i.e., rows in application DB) for nested Fields of a single Field, one or both
  `field-metadata` (from synced DB) and `metabase-field` (from application DB)."
  [table          :- i/TableInstance
   field-metadata :- [:maybe i/TableMetadataField]
   metabase-field :- [:maybe common/TableMetadataFieldWithID]]
  (let [nested-fields-metadata (:nested-fields field-metadata)
        metabase-nested-fields (:nested-fields metabase-field)]
    (when (or (seq nested-fields-metadata)
              (seq metabase-nested-fields))
      (sync-instances!
       table
       (set nested-fields-metadata)
       (set metabase-nested-fields)
       (some-> metabase-field u/the-id)))))

(mu/defn ^:private sync-nested-field-instances! :- [:maybe ms/IntGreaterThanOrEqualToZero]
  "Recursively sync Field instances (i.e., rows in application DB) for *all* the nested Fields of all Fields in
  `db-metadata` and `our-metadata`.
  Not for the flattened nested fields for JSON columns in normal RDBMSes (nested field columns)"
  [table        :- i/TableInstance
   db-metadata  :- [:set i/TableMetadataField]
   our-metadata :- [:set common/TableMetadataFieldWithID]]
  (let [name->field-metadata (m/index-by common/canonical-name db-metadata)
        name->metabase-field (m/index-by common/canonical-name our-metadata)
        all-field-names      (set (concat (keys name->field-metadata)
                                          (keys name->metabase-field)))]
    (sync-util/sum-for [field-name all-field-names
                        :let [field-metadata (get name->field-metadata field-name)
                              metabase-field (get name->metabase-field field-name)]]
      (sync-nested-fields-of-one-field! table field-metadata metabase-field))))

(mu/defn sync-instances! :- ms/IntGreaterThanOrEqualToZero
  "Sync rows in the Field table with `db-metadata` describing the current schema of the Table currently being synced,
  creating Field objects or marking them active/inactive as needed."
  ([table        :- i/TableInstance
    db-metadata  :- [:set i/TableMetadataField]
    our-metadata :- [:set common/TableMetadataFieldWithID]]
   (sync-instances! table db-metadata our-metadata nil))

  ([table        :- i/TableInstance
    db-metadata  :- [:set i/TableMetadataField]
    our-metadata :- [:set common/TableMetadataFieldWithID]
    parent-id    :- common/ParentID]
   ;; syncing the active instances makes important changes to `our-metadata` that need to be passed to recursive
   ;; calls, such as adding new Fields or making inactive ones active again. Keep updated version returned by
   ;; `sync-active-instances!`
   (let [{:keys [num-updates our-metadata]} (sync-active-instances! table db-metadata our-metadata parent-id)]
     (+ num-updates
        (retire-fields! table db-metadata our-metadata)
        (sync-nested-field-instances! table db-metadata our-metadata)))))
