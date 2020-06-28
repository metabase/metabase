(ns metabase.sync.sync-metadata.fields.sync-metadata
  "Logic for updating metadata properties of `Field` instances in the application database as needed -- this includes
  the base type, database type, special type, and comment/remark (description) properties. This primarily affects
  Fields that were not newly created; newly created Fields are given appropriate metadata when first synced."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.models.field :as field :refer [Field]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.sync.sync-metadata.fields.common :as common]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [trs]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private update-field-metadata-if-needed! :- (s/enum 0 1)
  "Update the metadata for a Metabase Field as needed if any of the info coming back from the DB has changed. Syncs
  base type, database type, special type, and comments/remarks; returns `1` if the Field was updated; `0` otherwise."
  [table :- i/TableInstance, field-metadata :- i/TableMetadataField, metabase-field :- common/TableMetadataFieldWithID]
  (let [{old-database-type     :database-type
         old-base-type         :base-type
         old-field-comment     :field-comment
         old-special-type      :special-type
         old-database-position :database-position}  metabase-field
        {new-database-type     :database-type
         new-base-type         :base-type
         new-field-comment     :field-comment
         new-database-position :database-position} field-metadata
        new-database-type                          (or new-database-type "NULL")
        new-special-type                           (common/special-type field-metadata)

        new-db-type?
        (not= old-database-type new-database-type)

        new-base-type?
        (not= old-base-type new-base-type)

        ;; only sync comment if old value was blank so we don't overwrite user-set values
        new-special-type?
        (and (nil? old-special-type)
             (not= old-special-type new-special-type))

        new-comment?
        (and (str/blank? old-field-comment)
             (not (str/blank? new-field-comment)))

        new-database-position?
        (not= old-database-position new-database-position)

        ;; calculate combined updates
        updates
        (merge
         (when new-db-type?
           (log/info (trs "Database type of {0} has changed from ''{1}'' to ''{2}''."
                          (common/field-metadata-name-for-logging table metabase-field)
                          old-database-type
                          new-database-type))
           {:database_type new-database-type})
         (when new-base-type?
           (log/info (trs "Base type of {0} has changed from ''{1}'' to ''{2}''."
                          (common/field-metadata-name-for-logging table metabase-field)
                          old-base-type
                          new-base-type))
           {:base_type new-base-type})
         (when new-special-type?
           (log/info (trs "Special type of {0} has changed from ''{1}'' to ''{2}''."
                          (common/field-metadata-name-for-logging table metabase-field)
                          old-special-type
                          new-special-type))
           {:special_type new-special-type})
         (when new-comment?
           (log/info (trs "Comment has been added for {0}."
                          (common/field-metadata-name-for-logging table metabase-field)))
           {:description new-field-comment})
         (when new-database-position?
           (log/info (trs "Database position of {0} has changed from ''{1}'' to ''{2}''."
                          (common/field-metadata-name-for-logging table metabase-field)
                          old-database-position
                          new-database-position))
           {:database_position new-database-position}))]
    ;; if any updates need to be done, do them and return 1 (because 1 Field was updated), otherwise return 0
    (if (and (seq updates)
             (db/update! Field (u/get-id metabase-field) updates))
      1
      0)))

(declare update-metadata!)

(s/defn ^:private update-nested-fields-metadata! :- su/IntGreaterThanOrEqualToZero
  "Recursively call `update-metadata!` for all the nested Fields in a `metabase-field`."
  [table :- i/TableInstance, field-metadata :- i/TableMetadataField, metabase-field :- common/TableMetadataFieldWithID]
  (let [nested-fields-metadata (:nested-fields field-metadata)
        metabase-nested-fields (:nested-fields metabase-field)]
    (if (seq metabase-nested-fields)
      (update-metadata! table (set nested-fields-metadata) (set metabase-nested-fields))
      0)))

(s/defn update-metadata! :- su/IntGreaterThanOrEqualToZero
  "Make sure things like PK status and base-type are in sync with what has come back from the DB. Recursively updates
  nested Fields. Returns total number of Fields updated."
  [table        :- i/TableInstance
   db-metadata  :- #{i/TableMetadataField}
   our-metadata :- #{common/TableMetadataFieldWithID}]
  (sync-util/sum-for [metabase-field our-metadata]
    ;; only update metadata for 'existing' Fields that are present in our Metadata (i.e., present in the application
    ;; database) and that are still considered active (i.e., present in DB metadata)
    (when-let [field-metadata (common/matching-field-metadata metabase-field db-metadata)]
      (+ (update-field-metadata-if-needed! table field-metadata metabase-field)
         (update-nested-fields-metadata! table field-metadata metabase-field)))))
