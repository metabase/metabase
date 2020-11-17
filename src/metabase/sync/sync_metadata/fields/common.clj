(ns metabase.sync.sync-metadata.fields.common
  "Schemas and functions shared by different `metabase.sync.sync-metadata.fields.*` namespaces."
  (:require [clojure.string :as str]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.util
             [i18n :refer [trs]]
             [schema :as su]]
            [schema.core :as s]))

(def ParentID
  "Schema for the `parent-id` of a Field, i.e. an optional ID."
  (s/maybe su/IntGreaterThanZero))

(def TableMetadataFieldWithID
  "Schema for `TableMetadataField` with an included ID of the corresponding Metabase Field object.
  `our-metadata` is always returned in this format. (The ID is needed in certain places so we know which Fields to
  retire, and the parent ID of any nested-fields.)"
  (assoc i/TableMetadataField
    :id                             su/IntGreaterThanZero
    (s/optional-key :nested-fields) #{(s/recursive #'TableMetadataFieldWithID)}))

(def TableMetadataFieldWithOptionalID
  "Schema for either `i/TableMetadataField` (`db-metadata`) or `TableMetadataFieldWithID` (`our-metadata`)."
  (assoc i/TableMetadataField
    (s/optional-key :id)            su/IntGreaterThanZero
    (s/optional-key :nested-fields) #{(s/recursive #'TableMetadataFieldWithOptionalID)}))


(s/defn field-metadata-name-for-logging :- s/Str
  "Return a 'name for logging' for a map that conforms to the `TableMetadataField` schema.

      (field-metadata-name-for-logging table field-metadata) ; -> \"Table 'venues' Field 'name'\""
  [table :- i/TableInstance, field-metadata :- TableMetadataFieldWithOptionalID]
  (format "%s %s '%s'" (sync-util/name-for-logging table) (trs "Field") (:name field-metadata)))

(defn canonical-name
  "Return the lower-cased 'canonical' name that should be used to uniquely identify `field` -- this is done to ignore
  case differences when syncing, e.g. we will consider `FIELD` and `field` to mean the same thing."
  [field]
  (str/lower-case (:name field)))

(s/defn special-type :- (s/maybe su/FieldType)
  "Determine a the appropriate `special-type` for a Field with `field-metadata`."
  [field-metadata :- (s/maybe i/TableMetadataField)]
  (and field-metadata
       (or (:special-type field-metadata)
           (when (:pk? field-metadata) :type/PK))))

(s/defn matching-field-metadata :- (s/maybe TableMetadataFieldWithOptionalID)
  "Find Metadata that matches `field-metadata` from a set of `other-metadata`, if any exists. Useful for finding the
  corresponding Metabase Field for field metadata from the DB, or vice versa."
  [field-metadata :- TableMetadataFieldWithOptionalID
   other-metadata :- #{TableMetadataFieldWithOptionalID}]
  (some
   (fn [other-field-metadata]
     (when (= (canonical-name field-metadata)
              (canonical-name other-field-metadata))
       other-field-metadata))
   other-metadata))
