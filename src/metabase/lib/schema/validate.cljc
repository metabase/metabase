(ns metabase.lib.schema.validate
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::missing-column-error
  [:map {:closed true}
   [:type {:decode/normalize common/normalize-keyword} [:= :missing-column]]
   [:name :string]])

(mr/def ::missing-table-alias-error
  [:map {:closed true}
   [:type {:decode/normalize common/normalize-keyword} [:= :missing-table-alias]]
   [:name :string]])

(mr/def ::missing-table-error
  "A stage's `:source-table` references a table that is missing or inactive (e.g. dropped during sync).
   The offending table is identified by the `:source-entity-*` keys, so no `:name` is carried."
  [:map {:closed true}
   [:type {:decode/normalize common/normalize-keyword} [:= :missing-table]]])

(mr/def ::missing-card-error
  "A stage's `:source-card` references a card that has been deleted.
   The offending card is identified by the `:source-entity-*` keys, so no `:name` is carried."
  [:map {:closed true}
   [:type {:decode/normalize common/normalize-keyword} [:= :missing-card]]])

(mr/def ::duplicate-column-error
  [:map {:closed true}
   [:type {:decode/normalize common/normalize-keyword} [:= :duplicate-column]]
   [:name :string]])

(mr/def ::syntax-error
  [:map {:closed true}
   [:type {:decode/normalize common/normalize-keyword} [:= :syntax-error]]])

(mr/def ::validation-exception-error
  [:map {:closed true}
   [:type {:decode/normalize common/normalize-keyword} [:= :validation-exception-error]]
   [:message :string]])

(mr/def ::validate-error-type
  [:enum :missing-column :missing-table-alias :missing-table :missing-card :duplicate-column :syntax-error
   :validation-exception-error])

(mr/def ::error
  [:multi {:dispatch #(some-> % :type keyword)}
   [:missing-column             [:ref ::missing-column-error]]
   [:missing-table-alias        [:ref ::missing-table-alias-error]]
   [:missing-table              [:ref ::missing-table-error]]
   [:missing-card               [:ref ::missing-card-error]]
   [:duplicate-column           [:ref ::duplicate-column-error]]
   [:syntax-error               [:ref ::syntax-error]]
   [:validation-exception-error [:ref ::validation-exception-error]]])

(mr/def ::source-entity-type
  "The type of the source entity causing an error."
  [:enum :table :card :transform])

(mr/def ::source-entity
  "Optional source entity tracking fields for dependency analysis."
  [:map {:closed true}
   [:source-entity-type {:optional true} [:maybe ::source-entity-type]]
   [:source-entity-id {:optional true} [:maybe pos-int?]]])

(mr/def ::soft
  "Whether the offending ref could be dropped, e.g. from a `:fields` list, without breaking the query."
  [:map {:closed true}
   [:soft? {:optional true} :boolean]])

(mr/def ::error-with-source
  "An error with optional source entity information.
   Extends the base error types with source tracking for dependency analysis."
  [:multi {:dispatch #(some-> % :type keyword)}
   [:missing-column             [:merge [:ref ::missing-column-error] [:ref ::source-entity] [:ref ::soft]]]
   [:missing-table-alias        [:merge [:ref ::missing-table-alias-error] [:ref ::source-entity] [:ref ::soft]]]
   [:missing-table              [:merge [:ref ::missing-table-error] [:ref ::source-entity] [:ref ::soft]]]
   [:missing-card               [:merge [:ref ::missing-card-error] [:ref ::source-entity] [:ref ::soft]]]
   [:duplicate-column           [:merge [:ref ::duplicate-column-error] [:ref ::source-entity] [:ref ::soft]]]
   [:syntax-error               [:merge [:ref ::syntax-error] [:ref ::source-entity] [:ref ::soft]]]
   [:validation-exception-error [:merge [:ref ::validation-exception-error] [:ref ::source-entity] [:ref ::soft]]]])
