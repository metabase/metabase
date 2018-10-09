(ns metabase.sync.sync-metadata.fields
  "Logic for updating Metabase Field models from metadata fetched from a physical DB.
  The basic idea here is to look at the metadata we get from calling `describe-table` on a connected database, then
  construct an identical set of metadata from what we have about that Table in the Metabase DB. Then we iterate over
  both sets of Metadata and perform whatever steps are needed to make sure the things in the DB match the things that
  came back from `describe-table`."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.models
             [field :as field :refer [Field]]
             [humanization :as humanization]
             [table :as table :refer [Table]]]
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
  `our-metadata` is always returned in this format. (The ID is needed in certain places so we know which Fields to
  retire, and the parent ID of any nested-fields.)"
  (assoc i/TableMetadataField
    :id                             su/IntGreaterThanZero
    (s/optional-key :nested-fields) #{(s/recursive #'TableMetadataFieldWithID)}))

(def ^:private TableMetadataFieldWithOptionalID
  "Schema for either `i/TableMetadataField` (`db-metadata`) or `TableMetadataFieldWithID` (`our-metadata`)."
  (assoc i/TableMetadataField
    (s/optional-key :id)            su/IntGreaterThanZero
    (s/optional-key :nested-fields) #{(s/recursive #'TableMetadataFieldWithOptionalID)}))


(s/defn ^:private field-metadata-name-for-logging :- s/Str
  "Return a 'name for logging' for a map that conforms to the `TableMetadataField` schema.

      (field-metadata-name-for-logging table field-metadata) ; -> \"Table 'venues' Field 'name'\""
  [table :- i/TableInstance, field-metadata :- TableMetadataFieldWithOptionalID]
  (format "%s Field '%s'" (sync-util/name-for-logging table) (:name field-metadata)))

(defn- canonical-name [field]
  (str/lower-case (:name field)))

(s/defn ^:private special-type [field :- (s/maybe i/TableMetadataField)]
  (and field
       (or (:special-type field)
           (when (:pk? field) :type/PK))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         CREATING / REACTIVATING FIELDS                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private matching-inactive-fields :- (s/maybe [i/FieldInstance])
  "Return an inactive metabase Field that matches NEW-FIELD-METADATA, if any such Field existis."
  [table :- i/TableInstance, new-field-metadatas :- [i/TableMetadataField], parent-id :- ParentID]
  (when (seq new-field-metadatas)
    (db/select     Field
      :table_id    (u/get-id table)
      :%lower.name [:in (map canonical-name new-field-metadatas)]
      :parent_id   parent-id
      :active      false)))

(s/defn ^:private insert-fields-if-needed! :- (s/maybe [s/Int])
  [table :- i/TableInstance, new-fields :- [i/TableMetadataField], parent-id :- ParentID]
  (when (seq new-fields)
    (db/insert-many! Field
      (for [{:keys [database-type base-type field-comment], field-name :name :as field} new-fields]
        {:table_id      (u/get-id table)
         :name          field-name
         :display_name  (humanization/name->human-readable-name field-name)
         :database_type (or database-type "NULL") ; placeholder for Fields w/ no type info (e.g. Mongo) & all NULL
         :base_type     base-type
         :special_type  (special-type field)
         :parent_id     parent-id
         :description   field-comment}))))

(s/defn ^:private ->metabase-fields! :- [i/FieldInstance]
  "Return an active Metabase Field instance that matches NEW-FIELD-METADATA. This object will be created or
  reactivated as a side effect of calling this function."
  [table :- i/TableInstance, new-field-metadata-chunk :- [i/TableMetadataField], parent-id :- ParentID]
  (let [fields-to-reactivate (matching-inactive-fields table new-field-metadata-chunk parent-id)]

    ;; if the field already exists but was just marked inactive then reäctivate it
    (when (seq fields-to-reactivate)
      (db/update-where! Field {:id [:in (map u/get-id fields-to-reactivate)]}
        :active true))

    (let [reactivated-pred (comp (set (map canonical-name fields-to-reactivate)) canonical-name)
          ;; If we reactivated the fields, no need to insert them
          new-field-ids (insert-fields-if-needed! table (remove reactivated-pred new-field-metadata-chunk) parent-id)]

      ;; now return the Field in question
      (when-let [new-and-updated-fields (seq (map u/get-id (concat fields-to-reactivate new-field-ids)))]
        (db/select Field :id [:in new-and-updated-fields])))))

(s/defn ^:private create-or-reactivate-field-chunk!
  "Create (or reactivate) a Metabase Field object(s) for NEW-FIELD-METABASE and any nested fields."
  [table :- i/TableInstance, new-field-metadata-chunk :- [i/TableMetadataField], parent-id :- ParentID]
  ;; Create (or reactivate) the Metabase Field entry for NEW-FIELD-METADATA...
  (let [updated-fields (->metabase-fields! table new-field-metadata-chunk parent-id)
        name->updated-field (u/key-by canonical-name updated-fields)]
    ;; ...then recursively do the same for any nested fields that belong to it.
    (doseq [{nested-fields :nested-fields, :as new-field} new-field-metadata-chunk
            :when (seq nested-fields)
            :let [new-parent-id (u/get-id (get name->updated-field (canonical-name new-field)))]]
      (create-or-reactivate-field-chunk! table (seq nested-fields) new-parent-id))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            UPDATING FIELD TYPE INFO                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private update-field-metadata-if-needed!
  "Update the metadata for a Metabase Field as needed if any of the info coming back from the DB has changed."
  [table :- i/TableInstance, metabase-field :- TableMetadataFieldWithID, field-metadata :- i/TableMetadataField]
  (let [{old-database-type :database-type,
         old-base-type     :base-type,
         old-field-comment :field-comment} metabase-field
        {new-database-type :database-type,
         new-base-type     :base-type,
         new-field-comment :field-comment} field-metadata
        new-db-type?                       (not= old-database-type new-database-type)
        new-base-type?                     (not= old-base-type new-base-type)]
    ;; If the driver is reporting a different `database-type` than what we have recorded in the DB, update it
    (when new-db-type?
      (log/info (format "Database type of %s has changed from '%s' to '%s'."
                        (field-metadata-name-for-logging table metabase-field)
                        old-database-type new-database-type))
      (db/update! Field (u/get-id metabase-field), :database_type new-database-type))
    ;; Now do the same for `base-type`
    (when new-base-type?
      (log/info (format "Base type of %s has changed from '%s' to '%s'."
                        (field-metadata-name-for-logging table metabase-field)
                        old-base-type new-base-type))
      (db/update! Field (u/get-id metabase-field), :base_type new-base-type))
    ;; And field comment, but only if the existing description is blank
    (when (and (str/blank? old-field-comment) (not (str/blank? new-field-comment)))
      (log/info (format "Comment has been added for %s."
                        (field-metadata-name-for-logging table metabase-field)))
      (db/update! Field (u/get-id metabase-field), :description new-field-comment))

    (or new-db-type? new-base-type?)))



;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           "RETIRING" INACTIVE FIELDS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private retire-field!
  "Mark an OLD-FIELD belonging to TABLE as inactive if corresponding Field object exists."
  [table :- i/TableInstance, old-field :- TableMetadataFieldWithID]
  (log/info (format "Marking %s as inactive." (field-metadata-name-for-logging table old-field)))
  (db/update! Field (:id old-field)
    :active false)
  ;; Now recursively mark and nested fields as inactive
  (doseq [nested-field (:nested-fields old-field)]
    (retire-field! table nested-field)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                           SYNCING FIELDS IN DB (CREATING, REACTIVATING, OR RETIRING)                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private matching-field-metadata :- (s/maybe TableMetadataFieldWithOptionalID)
  "Find Metadata that matches FIELD-METADATA from a set of OTHER-METADATA, if any exists."
  [field-metadata :- TableMetadataFieldWithOptionalID, other-metadata :- #{TableMetadataFieldWithOptionalID}]
  (some (fn [other-field-metadata]
          (when (= (canonical-name field-metadata)
                   (canonical-name other-field-metadata))
              other-field-metadata))
        other-metadata))

(declare sync-field-instances!)

(s/defn ^:private update-field-chunk!
  [table :- i/TableInstance
   known-fields :- {s/Str TableMetadataFieldWithID}
   our-field :- i/TableMetadataField]
  (let [db-field (get known-fields (canonical-name our-field))
        ;; if field exists in both metadata sets then make sure the data recorded about the Field such as
        ;; database_type is up-to-date...
        updated-count (if (update-field-metadata-if-needed! table db-field our-field)
                        ;; One field was updated
                        1
                        ;; No fields were updated
                        0)]
    ;; ...and then recursively check the nested fields.
    (if-let [db-nested-fields (seq (:nested-fields our-field))]
      ;; Any nested fields that were updated should be included in this chunk's count
      (+ updated-count (sync-field-instances! table (set db-nested-fields) (:nested-fields db-field) (:id our-field)))
      ;; No nested fields, so just the updated count from above
      updated-count)))

(s/defn ^:private sync-field-instances!
  "Make sure the instances of Metabase Field are in-sync with the DB-METADATA."
  [table :- i/TableInstance, db-metadata :- #{i/TableMetadataField}, our-metadata :- #{TableMetadataFieldWithID}
   parent-id :- ParentID]
  (let [known-fields (u/key-by canonical-name our-metadata)]
    (+
     ;; Loop thru fields in DB-METADATA. Create/reactivate any fields that don't exist in OUR-METADATA.
     (sync-util/sum-numbers
      (fn [db-field-chunk]
        (sync-util/with-error-handling (format "Error checking if Fields '%s' needs to be created or reactivated"
                                               (pr-str (map :name db-field-chunk)))
          (let [known-field-pred    (comp known-fields canonical-name)
                fields-to-update    (filter known-field-pred db-field-chunk)
                new-fields          (remove known-field-pred db-field-chunk)
                updated-chunk-count (sync-util/sum-numbers #(update-field-chunk! table known-fields %) fields-to-update)]

            ;; otherwise if field doesn't exist, create or reactivate it
            (when (seq new-fields)
              (create-or-reactivate-field-chunk! table new-fields parent-id))
            ;; Add the updated number of fields with the number of newly created fields
            (+ updated-chunk-count (count new-fields)))))
      (partition-all 1000 db-metadata))

     ;; ok, loop thru Fields in OUR-METADATA. Mark Fields as inactive if they don't exist in DB-METADATA.
     (sync-util/sum-numbers
      (fn [our-field]
        (sync-util/with-error-handling (format "Error checking if '%s' needs to be retired" (:name our-field))
          (if-let [db-field (matching-field-metadata our-field db-metadata)]
            ;; if field exists in both metadata sets we just need to recursively check the nested fields
            (if-let [our-nested-fields (seq (:nested-fields our-field))]
              (sync-field-instances! table (:nested-fields db-field) (set our-nested-fields) (:id our-field))
              ;; No fields were updated
              0)
            ;; otherwise if field exists in our metadata but not DB metadata time to make it inactive
            (do
              (retire-field! table our-field)
              ;; 1 field was updated (retired)
              1))))
      our-metadata))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            UPDATING FIELD METADATA                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private update-metadata!
  "Make sure things like PK status and base-type are in sync with what has come back from the DB."
  [table :- i/TableInstance, db-metadata :- #{i/TableMetadataField}, parent-id :- ParentID]
  (let [existing-fields         (db/select [Field :base_type :special_type :name :id :description]
                                  :table_id  (u/get-id table)
                                  :active    true
                                  :parent_id parent-id)
        field-name->db-metadata (u/key-by canonical-name db-metadata)]
    ;; Make sure special types are up-to-date for all the fields
    (sync-util/sum-numbers
     (fn [field]
       (let [db-field         (get field-name->db-metadata (canonical-name field))
             new-special-type (special-type db-field)]
         (if (and db-field
                  (or
                   ;; If the base_type has changed, we need to updated it
                   (not= (:base_type field) (:base-type db-field))
                   ;; If the base_type hasn't changed, but we now have a special_type, we should
                   ;; update it. We should not overwrite a special_type that is already present
                   ;; (could have been specified by the user).
                   (and (not (:special_type field)) new-special-type)))
           (do
             ;; update special type if one came back from DB metadata but Field doesn't
             ;; currently have one
             (db/update! Field (u/get-id field)
               (merge {:base_type (:base-type db-field)}
                      (when-not (:special_type field)
                        {:special_type new-special-type})))
             ;; now recursively do the same for any nested fields
             (if-let [db-nested-fields (seq (:nested-fields db-field))]
               ;; This field was updated + any nested fields
               (+ 1 (update-metadata! table (set db-nested-fields) (u/get-id field)))
               ;; No nested fields, so just this field was updated
               1))
           ;; The field was not updated
           0)))
     existing-fields)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         FETCHING OUR CURRENT METADATA                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private add-nested-fields :- TableMetadataFieldWithID
  "Recursively add entries for any nested-fields to FIELD."
  [field-metadata :- TableMetadataFieldWithID, parent-id->fields :- {ParentID #{TableMetadataFieldWithID}}]
  (let [nested-fields (get parent-id->fields (u/get-id field-metadata))]
    (if-not (seq nested-fields)
      field-metadata
      (assoc field-metadata :nested-fields (set (for [nested-field nested-fields]
                                                  (add-nested-fields nested-field parent-id->fields)))))))

(s/defn ^:private parent-id->fields :- {ParentID #{TableMetadataFieldWithID}}
  "Build a map of the Metabase Fields we have for TABLE, keyed by their parent id (usually `nil`)."
  [table :- i/TableInstance]
  (->> (for [field (db/select [Field :name :database_type :base_type :special_type :parent_id :id :description]
                     :table_id (u/get-id table)
                     :active   true)]
         {:parent-id     (:parent_id field)
          :id            (:id field)
          :name          (:name field)
          :database-type (:database_type field)
          :base-type     (:base_type field)
          :special-type  (:special_type field)
          :pk?           (isa? (:special_type field) :type/PK)
          :field-comment (:description field)})
       ;; make a map of parent-id -> set of
       (group-by :parent-id)
       ;; remove the parent ID because the Metadata from `describe-table` won't have it. Save the results as a set
       (m/map-vals (fn [fields]
                     (set (for [field fields]
                            (dissoc field :parent-id)))))))

(s/defn ^:private our-metadata :- #{TableMetadataFieldWithID}
  "Return information we have about Fields for a TABLE currently in the application database
   in (almost) exactly the same `TableMetadataField` format returned by `describe-table`."
  [table :- i/TableInstance]
  ;; Fetch all the Fields for this TABLE. Then group them by their parent ID, which we'll use to construct our
  ;; metadata in the correct format
  (let [parent-id->fields (parent-id->fields table)]
    ;; get all the top-level fields, then call `add-nested-fields` to recursively add the fields
    (set (for [field (get parent-id->fields nil)]
           (add-nested-fields field parent-id->fields)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      FETCHING METADATA FROM CONNECTED DB                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private db-metadata :- #{i/TableMetadataField}
  "Fetch metadata about Fields belonging to a given TABLE directly from an external database by calling its
   driver's implementation of `describe-table`."
  [database :- i/DatabaseInstance, table :- i/TableInstance]
  (:fields (fetch-metadata/table-metadata database table)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUTTING IT ALL TOGETHER                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- calculate-table-hash [db-metadata]
  (->> db-metadata
       (map (juxt :name :database-type :base-type :special-type :pk? :nested-fields :custom :field-comment))
       ;; We need a predictable sort order as the hash will be different if the order is different
       (sort-by first)
       sync-util/calculate-hash))

(s/defn sync-fields-for-table!
  "Sync the Fields in the Metabase application database for a specific TABLE."
  ([table :- i/TableInstance]
   (sync-fields-for-table! (table/database table) table))
  ([database :- i/DatabaseInstance, {:keys [fields_hash] :as table} :- i/TableInstance]
   (sync-util/with-error-handling (format "Error syncing fields for %s" (sync-util/name-for-logging table))
     (let [db-field-metadata (db-metadata database table)
           total-fields      (count db-field-metadata)
           db-hash           (calculate-table-hash db-field-metadata)]
       (if (and fields_hash (= db-hash fields_hash))
         (do
            (log/debugf "Hash of '%s' matches stored hash, skipping fields sync for table" (sync-util/name-for-logging table))
            {:updated-fields 0 :total-fields total-fields})
         ;; make sure the instances of Field are in-sync
         (let [updated-fields (+ (sync-field-instances! table db-field-metadata (our-metadata table) nil)
                                 ;; now that tables are synced and fields created as needed make sure field properties are in sync
                                 (update-metadata! table db-field-metadata nil))]
           ;; Either there was no hash or there has been some change, update the hash too
           (db/update! Table (u/get-id table) :fields_hash (calculate-table-hash (db-metadata database table)))
           {:updated-fields updated-fields
            :total-fields   total-fields}))))))

(s/defn sync-fields!
  "Sync the Fields in the Metabase application database for all the Tables in a DATABASE."
  [database :- i/DatabaseInstance]
  (let [tables (sync-util/db->sync-tables database)]
    (apply merge-with + (map #(sync-fields-for-table! database %) tables))))
