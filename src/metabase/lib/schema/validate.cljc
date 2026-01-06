(ns metabase.lib.schema.validate
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::missing-column-error
  [:map
   [:type [:= :validate/missing-column-error]]
   [:name :string]])

(mr/def ::missing-table-alias-error
  [:map
   [:type [:= :validate/missing-table-alias-error]]
   [:name :string]])

(mr/def ::duplicate-column-error
  [:map
   [:type [:= :validate/duplicate-column-error]]
   [:name :string]])

(mr/def ::syntax-error-error
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
    [:validate/missing-column-error      [:ref ::missing-column-error]]
    [:validate/missing-table-alias-error [:ref ::missing-table-alias-error]]
    [:validate/duplicate-column-error    [:ref ::duplicate-column-error]]
    [:validate/syntax-error              [:ref ::syntax-error]]
    [:validate/validation-exception-error   [:ref ::validation-exception-error]]]])
