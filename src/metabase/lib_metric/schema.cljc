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
   [:table-id ::lib.schema.id/table]
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
