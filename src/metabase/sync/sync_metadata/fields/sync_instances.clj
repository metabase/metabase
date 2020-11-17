(ns metabase.sync.sync-metadata.fields.sync-instances
  "Logic for syncing the instances of `Field` in the Metabase application DB with the set of Fields in the DB metadata.
  Responsible for creating new instances of `Field` as needed, and marking existing ones as active or inactive as
  needed. Recursively handles nested Fields.

  All nested Fields recursion is handled in one place, by the main entrypoint (`sync-instances!`) and helper
  functions `sync-nested-field-instances!` and `sync-nested-fields-of-one-field!`. All other functions in this
  namespace should ignore nested fields entirely; the will be invoked with those Fields as appropriate."
  (:require [clojure.tools.logging :as log]
            [metabase.models
             [field :as field :refer [Field]]
             [humanization :as humanization]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.sync.sync-metadata.fields
             [common :as common]
             [fetch-metadata :as fetch-metadata]]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [trs]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         CREATING / REACTIVATING FIELDS                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private matching-inactive-fields :- (s/maybe [i/FieldInstance])
  "Return inactive Metabase Fields that match any of the Fields described by `new-field-metadatas`, if any such Fields
  exist."
  [table :- i/TableInstance, new-field-metadatas :- [i/TableMetadataField], parent-id :- common/ParentID]
  (when (seq new-field-metadatas)
    (db/select     Field
      :table_id    (u/get-id table)
      :%lower.name [:in (map common/canonical-name new-field-metadatas)]
      :parent_id   parent-id
      :active      false)))

(s/defn ^:private insert-new-fields! :- (s/maybe [s/Int])
  "Insert new Field rows for for all the Fields described by `new-field-metadatas`."
  [table :- i/TableInstance, new-field-metadatas :- [i/TableMetadataField], parent-id :- common/ParentID]
  (when (seq new-field-metadatas)
    (db/insert-many! Field
      (for [{:keys [database-type base-type field-comment database-position], field-name :name :as field} new-field-metadatas]
        {:table_id          (u/get-id table)
         :name              field-name
         :display_name      (humanization/name->human-readable-name field-name)
         :database_type     (or database-type "NULL") ; placeholder for Fields w/ no type info (e.g. Mongo) & all NULL
         :base_type         base-type
         :special_type      (common/special-type field)
         :parent_id         parent-id
         :description       field-comment
         :position          database-position
         :database_position database-position}))))

(s/defn ^:private create-or-reactivate-fields! :- (s/maybe [i/FieldInstance])
  "Create (or reactivate) Metabase Field object(s) for any Fields in `new-field-metadatas`. Does *NOT* recursively
  handle nested Fields."
  [table :- i/TableInstance, new-field-metadatas :- [i/TableMetadataField], parent-id :- common/ParentID]
  (let [fields-to-reactivate (matching-inactive-fields table new-field-metadatas parent-id)]
    ;; if the fields already exist but were just marked inactive then reäctivate them
    (when (seq fields-to-reactivate)
      (db/update-where! Field {:id [:in (map u/get-id fields-to-reactivate)]}
        :active true))
    (let [reactivated?  (comp (set (map common/canonical-name fields-to-reactivate))
                              common/canonical-name)
          ;; If we reactivated the fields, no need to insert them; insert new rows for any that weren't reactivated
          new-field-ids (insert-new-fields! table (remove reactivated? new-field-metadatas) parent-id)]
      ;; now return the newly created or reactivated Fields
      (when-let [new-and-updated-fields (seq (map u/get-id (concat fields-to-reactivate new-field-ids)))]
        (db/select Field :id [:in new-and-updated-fields])))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                          SYNCING INSTANCES OF 'ACTIVE' FIELDS (FIELDS IN DB METADATA)                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private Updates
  "Schema for the value returned by `sync-active-instances!`. Because we need to know about newly-inserted/reactivated
  parent Fields when recursively syncing nested Fields, we need to propogate the updates to `our-metadata` made by
  this function and pass them to other steps of the `sync-instances!` process."
  {:num-updates  su/IntGreaterThanOrEqualToZero
   :our-metadata #{common/TableMetadataFieldWithID}})

(s/defn ^:private sync-active-instances! :- Updates
  "Sync instances of `Field` in the application database with 'active' Fields in the DB being synced (i.e., ones that
  are returned as part of the `db-metadata`). Creates or reactivates Fields as needed. Returns number of Fields
  synced and updated `our-metadata` including the new Fields and their IDs."
  [table        :- i/TableInstance
   db-metadata  :- #{i/TableMetadataField}
   our-metadata :- #{common/TableMetadataFieldWithID}
   parent-id    :- common/ParentID]
  (let [known-fields (u/key-by common/canonical-name our-metadata)
        our-metadata (atom our-metadata)]
    {:num-updates
     ;; Field sync logic below is broken out into chunks of 1000 fields for huge star schemas or other situations
     ;; where we don't want to be updating way too many rows at once
     (sync-util/sum-for [db-field-chunk (partition-all 1000 db-metadata)]
       (sync-util/with-error-handling (trs "Error checking if Fields {0} need to be created or reactivated"
                                           (pr-str (map :name db-field-chunk)))
         (let [known-field?        (comp known-fields common/canonical-name)
               fields-to-update    (filter known-field? db-field-chunk)
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

(s/defn ^:private retire-field! :- (s/maybe (s/eq 1))
  "Mark an `old-field` belonging to `table` as inactive if corresponding Field object exists. Does *NOT* recurse over
  nested Fields. Returns `1` if a Field was marked inactive, `nil` otherwise."
  [table :- i/TableInstance, metabase-field :- common/TableMetadataFieldWithID]
  (log/info (trs "Marking Field ''{0}'' as inactive." (common/field-metadata-name-for-logging table metabase-field)))
  (when (db/update! Field (u/get-id metabase-field) :active false)
    1))

(s/defn ^:private retire-fields! :- su/IntGreaterThanOrEqualToZero
  "Mark inactive any Fields in the application database that are no longer present in the DB being synced. These
  Fields are ones that are in `our-metadata`, but not in `db-metadata`. Does *NOT* recurse over nested Fields.
  Returns `1` if a Field was marked inactive."
  [table        :- i/TableInstance
   db-metadata  :- #{i/TableMetadataField}
   our-metadata :- #{common/TableMetadataFieldWithID}]
  ;; retire all the Fields not present in `db-metadata`, and count how many rows were actually affected
  (sync-util/sum-for [metabase-field our-metadata
                      :when          (not (common/matching-field-metadata metabase-field db-metadata))]
    (sync-util/with-error-handling (trs "Error retiring {0}"
                                        (common/field-metadata-name-for-logging table metabase-field))
      (retire-field! table metabase-field))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                  HIGH-LEVEL INSTANCE SYNCING LOGIC (CREATING/REACTIVATING/RETIRING/UPDATING)                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(declare sync-instances!)

(s/defn ^:private sync-nested-fields-of-one-field! :- (s/maybe su/IntGreaterThanOrEqualToZero)
  "Recursively sync Field instances (i.e., rows in application DB) for nested Fields of a single Field, one or both
  `field-metadata` (from synced DB) and `metabase-field` (from application DB)."
  [table          :- i/TableInstance
   field-metadata :- (s/maybe i/TableMetadataField)
   metabase-field :- (s/maybe common/TableMetadataFieldWithID)]
  (let [nested-fields-metadata (:nested-fields field-metadata)
        metabase-nested-fields (:nested-fields metabase-field)]
    (when (or (seq nested-fields-metadata)
              (seq metabase-nested-fields))
      (sync-instances!
       table
       (set nested-fields-metadata)
       (set metabase-nested-fields)
       (some-> metabase-field u/get-id)))))

(s/defn ^:private sync-nested-field-instances! :- (s/maybe su/IntGreaterThanOrEqualToZero)
  "Recursively sync Field instances (i.e., rows in application DB) for *all* the nested Fields of all Fields in
  `db-metadata` and `our-metadata`."
  [table        :- i/TableInstance
   db-metadata  :- #{i/TableMetadataField}
   our-metadata :- #{common/TableMetadataFieldWithID}]
  (let [name->field-metadata (u/key-by common/canonical-name db-metadata)
        name->metabase-field (u/key-by common/canonical-name our-metadata)
        all-field-names      (set (concat (keys name->field-metadata)
                                          (keys name->metabase-field)))]
    (sync-util/sum-for [field-name all-field-names
                        :let [field-metadata (get name->field-metadata field-name)
                              metabase-field (get name->metabase-field field-name)]]
      (sync-nested-fields-of-one-field! table field-metadata metabase-field))))

(s/defn sync-instances! :- su/IntGreaterThanOrEqualToZero
  "Sync rows in the Field table with `db-metadata` describing the current schema of the Table currently being synced,
  creating Field objects or marking them active/inactive as needed."
  ([table        :- i/TableInstance
    db-metadata  :- #{i/TableMetadataField}
    our-metadata :- #{common/TableMetadataFieldWithID}]
   (sync-instances! table db-metadata our-metadata nil))

  ([table        :- i/TableInstance
    db-metadata  :- #{i/TableMetadataField}
    our-metadata :- #{common/TableMetadataFieldWithID}
    parent-id    :- common/ParentID]
   ;; syncing the active instances makes important changes to `our-metadata` that need to be passed to recursive
   ;; calls, such as adding new Fields or making inactive ones active again. Keep updated version returned by
   ;; `sync-active-instances!`
   (let [{:keys [num-updates our-metadata]} (sync-active-instances! table db-metadata our-metadata parent-id)]
     (+ num-updates
        (retire-fields! table db-metadata our-metadata)
        (sync-nested-field-instances! table db-metadata our-metadata)))))
