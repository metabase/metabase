(ns metabase.lib-metric.schema
  "Malli schemas for metric dimensions, dimension-mappings, and dimension-references."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.util.malli.registry :as mr]))

(comment lib.schema.ref/keep-me)

(mr/def ::dimension-id
  "UUID string identifying a dimension."
  ::lib.schema.common/uuid)

(mr/def ::dimension
  "Schema for a dimension definition."
  [:map
   [:id ::dimension-id]
   [:display-name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:effective-type {:optional true} [:maybe ::lib.schema.common/base-type]]
   [:semantic-type {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]])

(mr/def ::dimension-mapping.type
  "Type of dimension mapping."
  [:enum :table])

(mr/def ::dimension-mapping.target
  "Target field reference for a dimension mapping, e.g. [:field {:source-field 1} 2]."
  [:ref :mbql.clause/field])

(mr/def ::dimension-mapping
  "Schema for a dimension mapping."
  [:map
   [:type ::dimension-mapping.type]
   [:table-id {:optional true} [:maybe ::lib.schema.id/table]]
   [:dimension-id ::dimension-id]
   [:target ::dimension-mapping.target]])

(mr/def ::dimension-reference.options
  "Options map for dimension references."
  [:map
   {:decode/normalize lib.schema.common/normalize-options-map}
   [:display-name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:effective-type {:optional true} [:maybe ::lib.schema.common/base-type]]
   [:semantic-type {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]])

(mr/def ::dimension-reference
  "Dimension reference clause [:dimension opts uuid]."
  [:tuple
   [:= :dimension]
   ::dimension-reference.options
   ::dimension-id])

;;; ------------------------------------------------- Persisted Dimensions -------------------------------------------------
;;; These schemas are used for storage format in the database.

(mr/def ::dimension-status
  "Status of a dimension indicating whether it's active or has issues.
   - :status/active   - Column exists, dimension is usable
   - :status/orphaned - Column was removed from schema, dimension preserved for reference"
  [:enum :status/active :status/orphaned])

(mr/def ::persisted-dimension
  "Schema for a persisted dimension definition with status tracking.
   Persisted dimensions include additional metadata about their status
   and any issues that prevent them from being used.
   Note: target field references are stored in dimension-mappings, not here."
  [:map
   [:id ::dimension-id]
   [:name {:optional true} [:maybe :string]]
   [:display-name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:effective-type {:optional true} [:maybe ::lib.schema.common/base-type]]
   [:semantic-type {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]
   [:status {:optional true} [:maybe ::dimension-status]]
   [:status-message {:optional true} [:maybe :string]]])

(mr/def ::persisted-dimensions
  "Schema for a sequence of persisted dimensions."
  [:sequential ::persisted-dimension])
