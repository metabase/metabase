(ns metabase.sync.sync-metadata.fields
  "Logic for updating Metabase Field models from metadata fetched from a physical DB.
   The basic idea here is to look at the metadata we get from calling `describe-table` on a connected database,
   then construct an identical set of metadata from what we have about that Table in the Metabase DB. Then we
   iterate over both sets of Metadata and perform whatever steps are needed to make sure the things in the DB
   match the things that came back from `describe-table`."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.models
             [field :as field :refer [Field]]
             [humanization :as humanization]
             [table :as table]]
            [metabase.sync
             [fetch-metadata :as fetch-metadata]
             [interface :as i]
             [util :as sync-util]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private ParentID (s/maybe su/IntGreaterThanZero))

(def ^:private TableMetadataFieldWithID
  "Schema for `TableMetadataField` with an included ID of the corresponding Metabase Field object.
   `our-metadata` is always returned in this format. (The ID is needed in certain places so we know
   which Fields to retire, and the parent ID of any nested-fields.)"
  (assoc i/TableMetadataField
    :id                             su/IntGreaterThanZero
    (s/optional-key :nested-fields) #{(s/recursive #'TableMetadataFieldWithID)}))

(def ^:private TableMetadataFieldWithOptionalID
  "Schema for either `i/TableMetadataField` (`db-metadata`) or `TableMetadataFieldWithID` (`our-metadata`)."
  (assoc i/TableMetadataField
    (s/optional-key :id)            su/IntGreaterThanZero
    (s/optional-key :nested-fields) #{(s/recursive #'TableMetadataFieldWithOptionalID)}))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                             CREATING / REACTIVATING FIELDS                                             |
;;; +------------------------------------------------------------------------------------------------------------------------+

(s/defn ^:private ^:always-validate matching-inactive-field :- (s/maybe i/FieldInstance)
  "Return an inactive metabase Field that matches NEW-FIELD-METADATA, if any such Field existis."
  [table :- i/TableInstance, new-field-metadata :- i/TableMetadataField, parent-id :- ParentID]
  (db/select-one Field
    :table_id    (u/get-id table)
    :%lower.name (str/lower-case (:name new-field-metadata))
    :parent_id   parent-id
    :active     false))

(s/defn ^:private ^:always-validate ->metabase-field! :- i/FieldInstance
  "Return an active Metabase Field instance that matches NEW-FIELD-METADATA. This object will be created or reactivated as a side effect of calling this function."
  [table :- i/TableInstance, new-field-metadata :- i/TableMetadataField, parent-id :- ParentID]
  (if-let [matching-inactive-field (matching-inactive-field table new-field-metadata parent-id)]
    ;; if the field already exists but was just marked inactive then reäctivate it
    (do (db/update! Field (u/get-id matching-inactive-field)
          :active true)
        ;; now return the Field in question
        (Field (u/get-id matching-inactive-field)))
    ;; otherwise insert a new field
    (let [{field-name :name, :keys [base-type special-type pk? raw-column-id]} new-field-metadata]
      (db/insert! Field
        :table_id     (u/get-id table)
        :name         field-name
        :display_name (humanization/name->human-readable-name field-name)
        :base_type    base-type
        :special_type (or special-type
                          (when pk? :type/PK))
        :parent_id    parent-id))))


(s/defn ^:private ^:always-validate create-or-reactivate-field!
  "Create (or reactivate) a Metabase Field object(s) for NEW-FIELD-METABASE and any nested fields."
  [table :- i/TableInstance, new-field-metadata :- i/TableMetadataField, parent-id :- ParentID]
  ;; Create (or reactivate) the Metabase Field entry for NEW-FIELD-METADATA...
  (let [metabase-field (->metabase-field! table new-field-metadata parent-id)]
    ;; ...then recursively do the same for any nested fields that belong to it.
    (doseq [nested-field (:nested-fields new-field-metadata)]
      (create-or-reactivate-field! table nested-field (u/get-id metabase-field)))))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                               "RETIRING" INACTIVE FIELDS                                               |
;;; +------------------------------------------------------------------------------------------------------------------------+

(s/defn ^:private ^:always-validate retire-field!
  "Mark an OLD-FIELD belonging to TABLE as inactive if corresponding Field object exists."
  [table :- i/TableInstance, old-field :- TableMetadataFieldWithID]
  (log/info (format "Marking %s Field '%s' as inactive." (sync-util/name-for-logging table) (:name old-field)))
  (db/update! Field (:id old-field)
    :active false)
  ;; Now recursively mark and nested fields as inactive
  (doseq [nested-field (:nested-fields old-field)]
    (retire-field! table nested-field)))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                               SYNCING FIELDS IN DB (CREATING, REACTIVATING, OR RETIRING)                               |
;;; +------------------------------------------------------------------------------------------------------------------------+

(s/defn ^:private ^:always-validate matching-field-metadata :- (s/maybe TableMetadataFieldWithOptionalID)
  "Find Metadata that matches FIELD-METADATA from a set of OTHER-METADATA, if any exists."
  [field-metadata :- TableMetadataFieldWithOptionalID, other-metadata :- #{TableMetadataFieldWithOptionalID}]
  (some (fn [other-field-metadata]
          (when (= (str/lower-case (:name field-metadata))
                   (str/lower-case (:name other-field-metadata)))
              other-field-metadata))
        other-metadata))

(s/defn ^:private ^:always-validate sync-field-instances!
  "Make sure the instances of Metabase Field are in-sync with the DB-METADATA."
  [table :- i/TableInstance, db-metadata :- #{i/TableMetadataField}, our-metadata :- #{TableMetadataFieldWithID}, parent-id :- ParentID]
  ;; Loop thru fields in DB-METADATA. Create/reactivate any fields that don't exist in OUR-METADATA.
  (doseq [db-field db-metadata]
    (sync-util/with-error-handling (format "Error checking if Field '%s' needs to be created or reactivated" (:name db-field))
      (if-let [our-field (matching-field-metadata db-field our-metadata)]
        ;; if field exists in both metadata sets then recursively check the nested fields
        (when-let [db-nested-fields (seq (:nested-fields db-field))]
          (sync-field-instances! table (set db-nested-fields) (:nested-fields our-field) (:id our-field)))
        ;; otherwise if field doesn't exist, create or reactivate it
        (create-or-reactivate-field! table db-field parent-id))))
  ;; ok, loop thru Fields in OUR-METADATA. Mark Fields as inactive if they don't exist in DB-METADATA.
  (doseq [our-field our-metadata]
    (sync-util/with-error-handling (format "Error checking if '%s' needs to be retired" (:name our-field))
      (if-let [db-field (matching-field-metadata our-field db-metadata)]
        ;; if field exists in both metadata sets we just need to recursively check the nested fields
        (when-let [our-nested-fields (seq (:nested-fields our-field))]
          (sync-field-instances! table (:nested-fields db-field) (set our-nested-fields) (:id our-field)))
        ;; otherwise if field exists in our metadata but not DB metadata time to make it inactive
        (retire-field! table our-field)))))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                UPDATING FIELD METADATA                                                 |
;;; +------------------------------------------------------------------------------------------------------------------------+

(s/defn ^:private ^:always-validate update-metadata!
  "Make sure things like PK status and base-type are in sync with what has come back from the DB."
  [table :- i/TableInstance, db-metadata :- #{i/TableMetadataField}, parent-id :- ParentID]
  (let [existing-fields      (db/select [Field :base_type :special_type :name :id]
                               :table_id  (u/get-id table)
                               :active    true
                               :parent_id parent-id)
        field-name->db-metadata (u/key-by (comp str/lower-case :name) db-metadata)]
    ;; Make sure special types are up-to-date for all the fields
    (doseq [field existing-fields]
      (when-let [db-field (get field-name->db-metadata (str/lower-case (:name field)))]
        ;; update special type if one came back from DB metadata but Field doesn't currently have one
        (db/update! Field (u/get-id field)
          (merge {:base_type (:base-type db-field)}
                 (when-not (:special_type field)
                   {:special_type (or (:special-type db-field)
                                      (when (:pk? db-field) :type/PK))})))
        ;; now recursively do the same for any nested fields
        (when-let [db-nested-fields (seq (:nested-fields db-field))]
          (update-metadata! table (set db-nested-fields) (u/get-id field)))))))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                             FETCHING OUR CURRENT METADATA                                              |
;;; +------------------------------------------------------------------------------------------------------------------------+

(s/defn ^:private ^:always-validate add-nested-fields :- TableMetadataFieldWithID
  "Recursively add entries for any nested-fields to FIELD."
  [field-metadata :- TableMetadataFieldWithID, parent-id->fields :- {ParentID #{TableMetadataFieldWithID}}]
  (let [nested-fields (get parent-id->fields (u/get-id field-metadata))]
    (if-not (seq nested-fields)
      field-metadata
      (assoc field-metadata :nested-fields (set (for [nested-field nested-fields]
                                                  (add-nested-fields nested-field parent-id->fields)))))))

(s/defn ^:private ^:always-validate parent-id->fields :- {ParentID #{TableMetadataFieldWithID}}
  "Build a map of the Metabase Fields we have for TABLE, keyed by their parent id (usually `nil`)."
  [table :- i/TableInstance]
  (->> (for [field (db/select [Field :name :base_type :special_type :parent_id :id]
                     :table_id (u/get-id table)
                     :active   true)]
         {:parent-id    (:parent_id field)
          :id           (:id field)
          :name         (:name field)
          :base-type    (:base_type field)
          :special-type (:special_type field)
          :pk?          (isa? (:special_type field) :type/PK)})
       ;; make a map of parent-id -> set of
       (group-by :parent-id)
       ;; remove the parent ID because the Metadata from `describe-table` won't have it. Save the results as a set
       (m/map-vals (fn [fields]
                     (set (for [field fields]
                            (dissoc field :parent-id)))))))

(s/defn ^:private ^:always-validate our-metadata :- #{TableMetadataFieldWithID}
  "Return information we have about Fields for a TABLE currently in the application database
   in (almost) exactly the same `TableMetadataField` format returned by `describe-table`."
  [table :- i/TableInstance]
  ;; Fetch all the Fields for this TABLE. Then group them by their parent ID, which we'll use to construct our metadata in the correct format
  (let [parent-id->fields (parent-id->fields table)]
    ;; get all the top-level fields, then call `add-nested-fields` to recursively add the fields
    (set (for [field (get parent-id->fields nil)]
           (add-nested-fields field parent-id->fields)))))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                          FETCHING METADATA FROM CONNECTED DB                                           |
;;; +------------------------------------------------------------------------------------------------------------------------+

(s/defn ^:private ^:always-validate db-metadata :- #{i/TableMetadataField}
  "Fetch metadata about Fields belonging to a given TABLE directly from an external database by calling its
   driver's implementation of `describe-table`."
  [database :- i/DatabaseInstance, table :- i/TableInstance]
  (:fields (fetch-metadata/table-metadata database table)))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                PUTTING IT ALL TOGETHER                                                 |
;;; +------------------------------------------------------------------------------------------------------------------------+

(s/defn ^:always-validate sync-fields-for-table!
  "Sync the Fields in the Metabase application database for a specific TABLE."
  ([table :- i/TableInstance]
   (sync-fields-for-table! (table/database table) table))
  ([database :- i/DatabaseInstance, table :- i/TableInstance]
   (sync-util/with-error-handling (format "Error syncing fields for %s" (sync-util/name-for-logging table))
     (let [db-metadata (db-metadata database table)]
       ;; make sure the instances of Field are in-sync
       (sync-field-instances! table db-metadata (our-metadata table) nil)
       ;; now that tables are synced and fields created as needed make sure field properties are in sync
       (update-metadata! table db-metadata nil)))))


(s/defn ^:always-validate sync-fields!
  "Sync the Fields in the Metabase application database for all the Tables in a DATABASE."
  [database :- i/DatabaseInstance]
  (doseq [table (sync-util/db->sync-tables database)]
    (sync-fields-for-table! database table)))
