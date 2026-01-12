(ns metabase.lib.schema.validate
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::missing-column-error
  [:map
   [:type [:= :validate/missing-column]]
   [:name :string]])

(mr/def ::missing-table-alias-error
  [:map
   [:type [:= :validate/missing-table-alias]]
   [:name :string]])

(mr/def ::duplicate-column-error
  [:map
   [:type [:= :validate/duplicate-column]]
   [:name :string]])

(mr/def ::syntax-error
  [:map
   [:type [:= :validate/syntax-error]]])

(mr/def ::validation-exception-error
  [:map
   [:type [:= :validate/validation-exception-error]]
   [:message :string]])

(mr/def ::validate-error-type
  [:and
   :keyword
   [:fn {:error/message "Must be in the validate ns"} #(= (namespace %) "validate")]])

(mr/def ::error
  [:and
   [:map [:type {:decode/normalize common/normalize-keyword} ::validate-error-type]]
   [:multi {:dispatch #(-> % :type keyword)}
    [:validate/missing-column             [:ref ::missing-column-error]]
    [:validate/missing-table-alias        [:ref ::missing-table-alias-error]]
    [:validate/duplicate-column           [:ref ::duplicate-column-error]]
    [:validate/syntax-error               [:ref ::syntax-error]]
    [:validate/validation-exception-error [:ref ::validation-exception-error]]]])

;; TODO(rileythomp): Check if this enum can be reused with existing analysis_finding analyzed_entity_type
(mr/def ::source-entity-type
  "The type of the source entity causing an error."
  [:enum :table :card])

;; TODO(rileythomp): Simplify these definitions
(mr/def ::error-with-source
  "An error with optional source entity information.
   Extends the base error types with source tracking for dependency analysis."
  [:and
   [:map
    [:type {:decode/normalize common/normalize-keyword} ::validate-error-type]
    [:source-entity-type {:optional true} [:maybe ::source-entity-type]]
    [:source-entity-id {:optional true} [:maybe pos-int?]]]
   [:multi {:dispatch #(-> % :type keyword)}
    [:validate/missing-column             [:merge [:ref ::missing-column-error]
                                           [:map
                                            [:source-entity-type {:optional true} [:maybe ::source-entity-type]]
                                            [:source-entity-id {:optional true} [:maybe pos-int?]]]]]
    [:validate/missing-table-alias        [:merge [:ref ::missing-table-alias-error]
                                           [:map
                                            [:source-entity-type {:optional true} [:maybe ::source-entity-type]]
                                            [:source-entity-id {:optional true} [:maybe pos-int?]]]]]
    [:validate/duplicate-column           [:merge [:ref ::duplicate-column-error]
                                           [:map
                                            [:source-entity-type {:optional true} [:maybe ::source-entity-type]]
                                            [:source-entity-id {:optional true} [:maybe pos-int?]]]]]
    [:validate/syntax-error               [:merge [:ref ::syntax-error]
                                           [:map
                                            [:source-entity-type {:optional true} [:maybe ::source-entity-type]]
                                            [:source-entity-id {:optional true} [:maybe pos-int?]]]]]
    [:validate/validation-exception-error [:merge [:ref ::validation-exception-error]
                                           [:map
                                            [:source-entity-type {:optional true} [:maybe ::source-entity-type]]
                                            [:source-entity-id {:optional true} [:maybe pos-int?]]]]]]])
