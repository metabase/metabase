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

(mr/def ::error
  [:and
   [:map [:type {:decode/normalize common/normalize-keyword} [:and
                                                              :keyword
                                                              [:fn #(= (namespace %) "validate")]]]]
   [:multi {:dispatch #(-> % :type keyword)}
    [:validate/missing-column             [:ref ::missing-column-error]]
    [:validate/missing-table-alias        [:ref ::missing-table-alias-error]]
    [:validate/duplicate-column           [:ref ::duplicate-column-error]]
    [:validate/syntax-error               [:ref ::syntax-error]]
    [:validate/validation-exception-error [:ref ::validation-exception-error]]]])
