(ns metabase.sync.sync-metadata.fields.sync-metadata
  "Logic for updating metadata properties of `Field` instances in the application database as needed -- this includes
  the base type, database type, semantic type, and comment/remark (description) properties. This primarily affects
  Fields that were not newly created; newly created Fields are given appropriate metadata when first synced."
  (:require
   [clojure.string :as str]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata.crufty :as crufty]
   [metabase.sync.sync-metadata.fields.common :as common]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.field-user-settings :as schema.field-user-settings]
   [toucan2.core :as t2]))

(defn- crufty-field? [db field-metadata]
  (crufty/name? (:name field-metadata)
                (some-> db :settings :auto-cruft-columns)))

(defn- compute-new-visibility-type [db field-metadata]
  (if (crufty-field? db field-metadata)
    :details-only
    ;; n.b. if it was auto-crufted in the past, removing it from auto-cruft will NOT make it visible because old
    ;; visibility-type will be :details-only. This only changes things to be hidden. If you want to make it visible
    ;; again, you need to change the visibility-type to :normal via the fields :put api.
    (:visibility-type field-metadata)))

(mu/defn- update-field-metadata-if-needed! :- [:enum 0 1]
  "Update the metadata for a Metabase Field as needed if any of the info coming back from the DB has changed. Syncs
  base type, database type, semantic type, and comments/remarks; returns `1` if the Field was updated; `0` otherwise."
  [database       :- i/DatabaseInstance
   table          :- i/TableInstance
   field-metadata :- i/TableMetadataField
   metabase-field :- common/TableMetadataFieldWithID]
  (let [{old-database-type              :database-type
         old-base-type                  :base-type
         old-field-comment              :field-comment
         old-semantic-type              :semantic-type
         old-database-position          :database-position
         old-position                   :position
         old-pk                         :pk?
         old-database-name              :name
         old-database-default           :database-default
         old-database-is-auto-increment :database-is-auto-increment
         old-database-is-generated      :database-is-generated
         old-database-is-nullable       :database-is-nullable
         old-db-partitioned             :database-partitioned
         old-db-required                :database-required
         old-visibility-type            :visibility-type
         old-preview-display            :preview-display} metabase-field
        {new-database-type              :database-type
         new-base-type                  :base-type
         new-field-comment              :field-comment
         new-database-position          :database-position
         new-database-name              :name
         new-pk                         :pk?
         new-database-default           :database-default
         new-database-is-auto-increment :database-is-auto-increment
         new-database-is-generated      :database-is-generated
         new-database-is-nullable       :database-is-nullable
         new-db-partitioned             :database-partitioned
         new-db-required                :database-required} field-metadata
        new-visibility-type             (compute-new-visibility-type database field-metadata)
        new-database-is-auto-increment  (boolean new-database-is-auto-increment)
        new-db-required                 (boolean new-db-required)
        new-database-type               (or new-database-type "NULL")
        new-semantic-type               (common/semantic-type field-metadata)

        new-db-type?
        (not= old-database-type new-database-type)

        new-base-type?
        (not= old-base-type new-base-type)

        ;; only sync comment if old value was blank so we don't overwrite user-set values
        new-semantic-type?
        (and (nil? old-semantic-type)
             (not= old-semantic-type new-semantic-type))

        new-comment?
        (and (str/blank? old-field-comment)
             (not (str/blank? new-field-comment)))

        new-database-position?
        (not= old-database-position new-database-position)

        ;; these fields are paired by by metabase.sync.sync-metadata.fields.common/canonical-name, so if they are
        ;; different they have the same canonical representation (lower-casing at the moment).
        new-name? (not= old-database-name new-database-name)

        new-pk?                  (not= old-pk new-pk)
        new-db-default?          (not= old-database-default new-database-default)
        new-db-auto-incremented? (not= old-database-is-auto-increment new-database-is-auto-increment)
        new-db-generated?        (not= old-database-is-generated new-database-is-generated)
        new-db-nullable?         (not= old-database-is-nullable new-database-is-nullable)
        new-db-partitioned?      (not= new-db-partitioned old-db-partitioned)
        new-db-required?           (not= old-db-required new-db-required)
        new-visibility-type?       (not= old-visibility-type new-visibility-type)
        ;; set preview_display=false for crufty fields (prevents FieldValues from being created)
        is-crufty?                 (crufty-field? database field-metadata)
        set-preview-display-false? (and is-crufty? old-preview-display)

        ;; calculate combined updates
        updates
        (merge
         (when new-db-type?
           (log/infof "Database type of %s has changed from '%s' to '%s'."
                      (common/field-metadata-name-for-logging table metabase-field)
                      old-database-type
                      new-database-type)
           {:database_type new-database-type})
         (when new-base-type?
           (log/infof "Base type of %s has changed from '%s' to '%s'. This field will be refingerprinted and analyzed."
                      (common/field-metadata-name-for-logging table metabase-field)
                      old-base-type
                      new-base-type)
           (doto
            {:base_type           new-base-type
             :effective_type      new-base-type
             :coercion_strategy   nil
                ;; reset fingerprint version so this field will get re-fingerprinted and analyzed
             :fingerprint_version 0
             :fingerprint         nil
                ;; semantic type needs to be set to nil so that the fingerprinter can re-infer it during analysis
             :semantic_type       nil}
             ;; we must override user-set values
             (->> (schema.field-user-settings/upsert-user-settings metabase-field))))
         (when new-semantic-type?
           (log/infof "Semantic type of %s has changed from '%s' to '%s'."
                      (common/field-metadata-name-for-logging table metabase-field)
                      old-semantic-type
                      new-semantic-type)
           {:semantic_type new-semantic-type})
         (when new-comment?
           (log/infof "Comment has been added for %s."
                      (common/field-metadata-name-for-logging table metabase-field))
           {:description new-field-comment})
         (when new-database-position?
           (log/infof "Database position of %s has changed from '%s' to '%s'."
                      (common/field-metadata-name-for-logging table metabase-field)
                      old-database-position
                      new-database-position)
           {:database_position new-database-position})
         (when (and (= (:field_order table) :database)
                    (not= old-position new-database-position))
           (log/infof "Position of %s has changed from '%s' to '%s'."
                      (common/field-metadata-name-for-logging table metabase-field)
                      old-position
                      new-database-position)
           {:position new-database-position})
         (when new-name?
           (log/infof "Name of %s has changed from '%s' to '%s'."
                      (common/field-metadata-name-for-logging table metabase-field)
                      old-database-name
                      new-database-name)
           {:name new-database-name})
         (when new-pk?
           ;; this guard avoids spamming logs with pk changes when people first upgrade to support database_is_pk
           (when (or ;; if we have any value for the old database_is_pk we have upgraded already, and can log regardless
                  (some? old-pk)
                     ;; otherwise, log only if logical pk status has changed
                  (not= new-pk (= old-semantic-type :type/PK)))
             (log/infof "Database pk of %s has changed from '%s' to '%s'"
                        (common/field-metadata-name-for-logging table metabase-field)
                        old-pk
                        new-pk))
           {:database_is_pk new-pk})
         (when new-db-auto-incremented?
           (log/infof "Database auto incremented of %s has changed from '%s' to '%s'."
                      (common/field-metadata-name-for-logging table metabase-field)
                      old-database-is-auto-increment
                      new-database-is-auto-increment)
           {:database_is_auto_increment new-database-is-auto-increment})
         (when new-db-generated?
           (log/infof "Database generated of %s has changed from '%s' to '%s'."
                      (common/field-metadata-name-for-logging table metabase-field)
                      old-database-is-generated
                      new-database-is-generated)
           {:database_is_generated new-database-is-generated})
         (when new-db-nullable?
           (log/infof "Database nullable of %s has changed from '%s' to '%s'."
                      (common/field-metadata-name-for-logging table metabase-field)
                      old-database-is-nullable
                      new-database-is-nullable)
           {:database_is_nullable new-database-is-nullable})
         (when new-db-default?
           (log/infof "Database default of %s has changed from '%s' to '%s'."
                      (common/field-metadata-name-for-logging table metabase-field)
                      old-database-default
                      new-database-default)
           {:database_default new-database-default})
         (when new-db-partitioned?
           (log/infof "Database partitioned of %s has changed from '%s' to '%s'."
                      (common/field-metadata-name-for-logging table metabase-field)
                      old-db-partitioned
                      new-db-partitioned)
           {:database_partitioned new-db-partitioned})
         (when new-db-required?
           (log/infof "Database required of %s has changed from '%s' to '%s'."
                      (common/field-metadata-name-for-logging table metabase-field)
                      old-db-required
                      new-db-required)
           {:database_required new-db-required})
         (when new-visibility-type?
           {:visibility_type new-visibility-type})
         (when set-preview-display-false?
           {:preview_display false}))]
    ;; if any updates need to be done, do them and return 1 (because 1 Field was updated), otherwise return 0
    (if (and (seq updates)
             (pos? (t2/update! :model/Field (u/the-id metabase-field) updates)))
      1
      0)))

(declare update-metadata!)

(mu/defn- update-nested-fields-metadata! :- ms/IntGreaterThanOrEqualToZero
  "Recursively call `update-metadata!` for all the nested Fields in a `metabase-field`."
  [database       :- i/DatabaseInstance
   table          :- i/TableInstance
   field-metadata :- i/TableMetadataField
   metabase-field :- common/TableMetadataFieldWithID]
  (let [nested-fields-metadata (:nested-fields field-metadata)
        metabase-nested-fields (:nested-fields metabase-field)]
    (if (seq metabase-nested-fields)
      (update-metadata! database table (set nested-fields-metadata) (set metabase-nested-fields))
      0)))

(mu/defn update-metadata! :- ms/IntGreaterThanOrEqualToZero
  "Make sure things like PK status and base-type are in sync with what has come back from the DB. Recursively updates
  nested Fields. Returns total number of Fields updated."
  [database     :- i/DatabaseInstance
   table        :- i/TableInstance
   db-metadata  :- [:set i/TableMetadataField]
   our-metadata :- [:set common/TableMetadataFieldWithID]]
  (sync-util/sum-for [metabase-field our-metadata]
    ;; only update metadata for 'existing' Fields that are present in our Metadata (i.e., present in the application
    ;; database) and that are still considered active (i.e., present in DB metadata)
    (when-let [field-metadata (common/matching-field-metadata metabase-field db-metadata)]
      (+ (update-field-metadata-if-needed! database table field-metadata metabase-field)
         (update-nested-fields-metadata! database table field-metadata metabase-field)))))
