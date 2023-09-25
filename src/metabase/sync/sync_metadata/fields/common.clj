(ns metabase.sync.sync-metadata.fields.common
  "Schemas and functions shared by different `metabase.sync.sync-metadata.fields.*` namespaces."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def ParentID
  "Schema for the `parent-id` of a Field, i.e. an optional ID."
  [:maybe ::lib.schema.id/field])

(mr/def ::TableMetadataFieldWithID
  [:merge
   i/TableMetadataField
   [:map
    [:id                             ::lib.schema.id/field]
    [:nested-fields {:optional true} [:set [:ref ::TableMetadataFieldWithID]]]]])

(def TableMetadataFieldWithID
  "Schema for `TableMetadataField` with an included ID of the corresponding Metabase Field object.
  `our-metadata` is always returned in this format. (The ID is needed in certain places so we know which Fields to
  retire, and the parent ID of any nested-fields.)"
  [:ref ::TableMetadataFieldWithID])

(mr/def ::TableMetadataFieldWithOptionalID
  [:merge
   [:ref ::TableMetadataFieldWithID]
   [:map
    [:id {:optional true}            ::lib.schema.id/field]
    [:nested-fields {:optional true} [:set [:ref ::TableMetadataFieldWithOptionalID]]]]])

(def TableMetadataFieldWithOptionalID
  "Schema for either `i/TableMetadataField` (`db-metadata`) or `TableMetadataFieldWithID` (`our-metadata`)."
  [:ref ::TableMetadataFieldWithOptionalID])

(mu/defn field-metadata-name-for-logging :- :string
  "Return a 'name for logging' for a map that conforms to the `TableMetadataField` schema.

      (field-metadata-name-for-logging table field-metadata) ; -> \"Table 'venues' Field 'name'\""
  [table :- i/TableInstance field-metadata :- TableMetadataFieldWithOptionalID]
  (format "%s %s '%s'" (sync-util/name-for-logging table) (trs "Field") (:name field-metadata)))

(defn canonical-name
  "Return the lower-cased 'canonical' name that should be used to uniquely identify `field` -- this is done to ignore
  case differences when syncing, e.g. we will consider `field` and `field` to mean the same thing."
  [field]
  (u/lower-case-en (:name field)))

(mu/defn semantic-type :- [:maybe ms/FieldSemanticOrRelationType]
  "Determine a the appropriate `semantic-type` for a Field with `field-metadata`."
  [field-metadata :- [:maybe i/TableMetadataField]]
  (and field-metadata
       (or (:semantic-type field-metadata)
           (when (:pk? field-metadata) :type/PK))))

(mu/defn matching-field-metadata :- [:maybe TableMetadataFieldWithOptionalID]
  "Find Metadata that matches `field-metadata` from a set of `other-metadata`, if any exists. Useful for finding the
  corresponding Metabase Field for field metadata from the DB, or vice versa. Will prefer exact matches."
  [field-metadata :- TableMetadataFieldWithOptionalID
   other-metadata :- [:set TableMetadataFieldWithOptionalID]]
  (let [matches (keep
                  (fn [other-field-metadata]
                    (when (= (canonical-name field-metadata)
                             (canonical-name other-field-metadata))
                      other-field-metadata))
                  other-metadata)
        num-matches (count matches)]
    (cond
      (zero? num-matches)
      nil

      (= 1 num-matches)
      (first matches)

      :else
      (or
        (some (fn [match]
                (when (= (:name field-metadata) (:name match))
                  match))
              matches)
        ;; Fallback if there's no exact match
        (first matches)))))
