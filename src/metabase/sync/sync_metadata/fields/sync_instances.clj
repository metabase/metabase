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
   [metabase.sync.db :as sync.db]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata.fields.common :as common]
   [metabase.sync.sync-metadata.fields.our-metadata :as fields.our-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.humanization :as warehouse-schema.humanization]
   [metabase.warehouse-schema.models.field :as field]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         CREATING / REACTIVATING FIELDS                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private field-name-max-length
  "Maximum length of the `metabase_field.name` column in the application DB (a `varchar(254)`). Fields whose name is
  longer than this can't be stored.

  We skip over-long Fields rather than store them, but an alternative worth considering is widening the column
  instead so these Fields become usable (e.g. BigQuery allows column names up to 300 characters). `name` is part of
  the `idx_unique_field` unique constraint and the `idx_field_name_lower` index, so any widening is bounded by
  MySQL/InnoDB's index key-length limit (~3072 bytes at utf8mb4 = 4 bytes/char) — i.e. up to roughly `varchar(512)`,
  which would cover every warehouse including BigQuery. Truncating is not an option: `name` is the real warehouse
  column name used to generate SQL, and truncating would break queries and could collide."
  254)

(mu/defn- remove-fields-with-too-long-names :- [:set i/TableMetadataField]
  "Drop any Fields in `db-metadata` whose name is too long to store in the application DB (see
  `field-name-max-length`), logging a warning. A single over-long column name would otherwise fail the INSERT for the
  entire chunk of Fields it lands in and prevent the rest of the Table from syncing."
  [table       :- i/TableInstance
   db-metadata :- [:set i/TableMetadataField]]
  (let [{too-long true, ok false} (group-by #(< field-name-max-length (count (:name %))) db-metadata)]
    (when (seq too-long)
      (log/warnf "Skipping %d Field(s) in %s whose name exceeds %d characters: %s"
                 (count too-long)
                 (sync-util/name-for-logging table)
                 field-name-max-length
                 (pr-str (sort (map :name too-long)))))
    (set ok)))

(mu/defn- matching-inactive-fields :- [:maybe [:sequential i/FieldInstance]]
  "Return inactive Metabase Fields that match any of the Fields described by `new-field-metadatas`, if any such Fields
  exist."
  [table               :- i/TableInstance
   new-field-metadatas :- [:maybe [:sequential i/TableMetadataField]]
   parent-id           :- common/ParentID]
  (when (seq new-field-metadatas)
    (sync.db/inactive-fields-by-lower-name (u/the-id table) parent-id (map common/canonical-name new-field-metadatas))))

(mu/defn- new-field-rows :- [:sequential :map]
  "The rows to insert for all the Fields of `table` described by `new-field-metadatas`, in database position order."
  [table               :- i/TableInstance
   new-field-metadatas :- [:maybe [:sequential i/TableMetadataField]]
   parent-id           :- common/ParentID]
  (vec (for [{:keys [base-type coercion-strategy database-is-auto-increment database-partitioned database-position
                     database-is-generated database-is-nullable database-default pk?
                     database-required database-type effective-type field-comment json-unfolding nfc-path visibility-type]
              field-name :name :as field} (sort-by :database-position new-field-metadatas)
             :let [semantic-type (common/semantic-type field)
                   has-field-values (when (sync-util/can-be-list? base-type semantic-type)
                                      :auto-list)]]
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
            :display_name               (warehouse-schema.humanization/name->human-readable-name field-name)
            :database_type              (or database-type "NULL") ; placeholder for Fields w/ no type info (e.g. Mongo) & all NULL
            :base_type                  base-type
            ;; todo test this?
            :effective_type             (if (and effective-type coercion-strategy) effective-type base-type)
            :coercion_strategy          (when effective-type coercion-strategy)
            :semantic_type              semantic-type
            :parent_id                  parent-id
            :nfc_path                   nfc-path
            :description                field-comment
            :position                   database-position
            :database_position          database-position
            :json_unfolding             (or json-unfolding false)
            :database_is_auto_increment (or database-is-auto-increment false)
            :database_is_generated      database-is-generated
            :database_is_nullable       database-is-nullable
            :database_is_pk             pk?
            :database_default           database-default
            :database_required          (or database-required false)
            :database_partitioned       database-partitioned ;; nullable for database that doesn't support partitioned fields
            :has_field_values           has-field-values
            :visibility_type            (or visibility-type :normal)}))))

(mu/defn- insert-new-fields! :- [:maybe [:sequential ::lib.schema.id/field]]
  "Insert new Field rows for for all the Fields described by `new-field-metadatas`. Returns IDs of newly inserted
  Fields."
  [table               :- i/TableInstance
   new-field-metadatas :- [:maybe [:sequential i/TableMetadataField]]
   parent-id           :- common/ParentID]
  (when (seq new-field-metadatas)
    (mapv :id (field/create-fields! (new-field-rows table new-field-metadatas parent-id)))))

(mu/defn- create-or-reactivate-fields! :- [:maybe [:sequential i/FieldInstance]]
  "Create (or reactivate) Metabase Field object(s) for any Fields in `new-field-metadatas`. Does *NOT* recursively
  handle nested Fields."
  [table               :- i/TableInstance
   new-field-metadatas :- [:maybe [:sequential i/TableMetadataField]]
   parent-id           :- common/ParentID]
  (let [fields-to-reactivate (matching-inactive-fields table new-field-metadatas parent-id)]
    ;; if the fields already exist but were just marked inactive then reäctivate them
    (when (seq fields-to-reactivate)
      (field/update-fields! (for [id (mapv u/the-id fields-to-reactivate)] {:id id :active true})))
    (let [reactivated?  (comp (set (map common/canonical-name fields-to-reactivate))
                              common/canonical-name)
          ;; If we reactivated the fields, no need to insert them; insert new rows for any that weren't reactivated
          new-field-ids (insert-new-fields! table (remove reactivated? new-field-metadatas) parent-id)]
      ;; now return the newly created or reactivated Fields
      (when-let [new-and-updated-fields (seq (map u/the-id (concat fields-to-reactivate new-field-ids)))]
        (sync.db/fields new-and-updated-fields)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                          SYNCING INSTANCES OF 'ACTIVE' FIELDS (FIELDS IN DB METADATA)                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private Updates
  "Schema for the value returned by `sync-active-instances!`. Because we need to know about newly-inserted/reactivated
  parent Fields when recursively syncing nested Fields, we need to propagate the updates to `our-metadata` made by
  this function and pass them to other steps of the `sync-instances!` process."
  [:map
   [:num-updates  ms/IntGreaterThanOrEqualToZero]
   [:our-metadata [:set common/TableMetadataFieldWithID]]])

(mu/defn- sync-active-instances! :- Updates
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
           (swap! our-metadata into (fields.our-metadata/fields->our-metadata new-field-instances parent-id))
           ;; now return count of rows updated
           (count new-fields))))

     :our-metadata
     @our-metadata}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           "RETIRING" INACTIVE FIELDS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- retire-fields! :- ms/IntGreaterThanOrEqualToZero
  "Mark inactive any Fields in the application database that are no longer present in the DB being synced. These
  Fields are ones that are in `our-metadata`, but not in `db-metadata`. Does *NOT* recurse over nested Fields. All of
  them are written together, in one bulk update, whatever their number. Returns the number of Fields marked inactive."
  [table        :- i/TableInstance
   db-metadata  :- [:set i/TableMetadataField]
   our-metadata :- [:set common/TableMetadataFieldWithID]]
  (let [to-retire (filterv #(not (common/matching-field-metadata % db-metadata)) our-metadata)]
    (if (empty? to-retire)
      0
      (let [result (sync-util/with-error-handling (format "Error retiring %d Fields of %s"
                                                          (count to-retire)
                                                          (common/field-metadata-name-for-logging table (first to-retire)))
                     (doseq [metabase-field to-retire]
                       (log/infof "Marking Field ''%s'' as inactive." (common/field-metadata-name-for-logging table metabase-field)))
                     (field/update-fields! (for [id (mapv u/the-id to-retire)] {:id id :active false}))
                     (count to-retire))]
        (if (number? result) result 0)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                  HIGH-LEVEL INSTANCE SYNCING LOGIC (CREATING/REACTIVATING/RETIRING/UPDATING)                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(declare sync-instances!)

(mu/defn- sync-nested-fields-of-one-field! :- [:maybe ms/IntGreaterThanOrEqualToZero]
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

(mu/defn- sync-nested-field-instances! :- [:maybe ms/IntGreaterThanOrEqualToZero]
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
   (let [db-metadata (remove-fields-with-too-long-names table db-metadata)]
     ;; syncing the active instances makes important changes to `our-metadata` that need to be passed to recursive
     ;; calls, such as adding new Fields or making inactive ones active again. Keep updated version returned by
     ;; `sync-active-instances!`
     (log/tracef "Syncing field instances for %s DB: %s, Existing: %s"
                 (sync-util/name-for-logging table)
                 (pr-str (sort (map common/canonical-name db-metadata)))
                 (pr-str (sort (map common/canonical-name our-metadata))))
     (let [{:keys [num-updates our-metadata]} (sync-active-instances! table db-metadata our-metadata parent-id)]
       (+ num-updates
          (retire-fields! table db-metadata our-metadata)
          (sync-nested-field-instances! table db-metadata our-metadata))))))

(def ^:private TableEntry
  "Schema for a Table being synced with the metadata of its Fields from the DB and from the app DB."
  [:map {:closed true}
   [:table        i/TableInstance]
   [:db-metadata  [:set i/TableMetadataField]]
   [:our-metadata [:set common/TableMetadataFieldWithID]]])

(def ^:private TablePlan
  "Schema for what syncing the top-level Fields of a Table has to insert, reactivate and retire."
  [:map {:closed true}
   [:table         i/TableInstance]
   [:new-fields    [:sequential i/TableMetadataField]]
   [:to-retire     [:sequential common/TableMetadataFieldWithID]]
   [:to-reactivate {:optional true} [:sequential (ms/InstanceOf :model/Field)]]
   [:to-insert     {:optional true} [:sequential i/TableMetadataField]]])

(def ^:private InactiveFields
  "Schema for inactive Fields by `[table-id lower-name]`."
  [:map-of [:tuple ::lib.schema.id/table :string] [:sequential (ms/InstanceOf :model/Field)]])

(mu/defn- table-plan :- TablePlan
  "The Table of `entry` with the Fields of its DB metadata that our metadata lacks, `:new-fields`, and the Fields of our
  metadata the DB metadata lacks, `:to-retire`."
  [{:keys [table db-metadata our-metadata]} :- TableEntry]
  (let [db-metadata  (remove-fields-with-too-long-names table db-metadata)
        known-fields (m/index-by common/canonical-name our-metadata)]
    {:table      table
     :new-fields (into [] (remove (comp known-fields common/canonical-name)) db-metadata)
     :to-retire  (filterv #(not (common/matching-field-metadata % db-metadata)) our-metadata)}))

(mu/defn- inactive-fields-by-table-and-name :- InactiveFields
  "The inactive top-level Fields named like the new Fields of `plans`, by `[table-id lower-name]`."
  [plans :- [:sequential TablePlan]]
  (let [plans     (filterv (comp seq :new-fields) plans)
        table-ids (mapv (comp u/the-id :table) plans)
        names     (into [] (comp (mapcat :new-fields) (map common/canonical-name) (distinct)) plans)]
    (group-by (juxt :table_id :lower_name)
              (when (seq names)
                (sync.db/inactive-top-level-fields-by-lower-name-for-tables table-ids names)))))

(mu/defn- add-reactivations :- TablePlan
  "`plan` with the `inactive` Fields its new Fields reactivate, `:to-reactivate`, and the new Fields left to insert,
  `:to-insert`."
  [inactive :- InactiveFields
   {:keys [table new-fields] :as plan} :- TablePlan]
  (let [to-reactivate (into []
                            (comp (mapcat #(get inactive [(u/the-id table) (common/canonical-name %)]))
                                  (m/distinct-by :id))
                            new-fields)
        reactivated?  (comp (set (map common/canonical-name to-reactivate)) common/canonical-name)]
    (assoc plan
           :to-reactivate to-reactivate
           :to-insert     (into [] (remove reactivated?) new-fields))))

(mu/defn sync-instances-of-tables! :- ms/IntGreaterThanOrEqualToZero
  "[[sync-instances!]] of the top-level Fields of each of `entries`, none of which has nested Fields, inserting the
  new Fields of all of them with one call and updating the reactivated and retired ones with one, and returning the
  number of Fields created, reactivated or retired."
  [entries :- [:sequential TableEntry]]
  (let [plans    (mapv table-plan entries)
        plans    (mapv (partial add-reactivations (inactive-fields-by-table-and-name plans)) plans)
        new-rows (into [] (mapcat (fn [{:keys [table to-insert]}] (new-field-rows table to-insert nil))) plans)
        updates  (into []
                       (mapcat (fn [{:keys [to-reactivate to-retire]}]
                                 (concat (for [field to-reactivate] {:id (u/the-id field) :active true})
                                         (for [field to-retire] {:id (u/the-id field) :active false}))))
                       plans)]
    (doseq [{:keys [table to-retire]} plans
            metabase-field             to-retire]
      (log/infof "Marking Field ''%s'' as inactive." (common/field-metadata-name-for-logging table metabase-field)))
    (when (seq new-rows)
      (field/create-fields! new-rows))
    (when (seq updates)
      (field/update-fields! updates))
    (transduce (map #(+ (count (:new-fields %)) (count (:to-retire %)))) + 0 plans)))
