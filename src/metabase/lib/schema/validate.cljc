(ns metabase.lib.schema.validate
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::missing-column
  [:map
   [:type [:= :validate/missing-column]]
   [:name :string]])

(mr/def ::missing-table-alias
  [:map
   [:type [:= :validate/missing-table-alias]]
   [:name :string]])

(mr/def ::duplicate-column
  [:map
   [:type [:= :validate/duplicate-column]]
   [:name :string]])

(mr/def ::syntax-error
  [:map
   [:type [:= :validate/syntax-error]]])

(mr/def ::validation-error
  [:map
   [:type [:= :validate/validation-error]
    :message :string]])

(mr/def ::error
  [:multi {:dispatch :type}
   [:validate/missing-column [:ref ::missing-column]]
   [:validate/missing-table-alias [:ref ::missing-table-alias]]
   [:validate/duplicate-column [:ref ::duplicate-column]]
   [:validate/syntax-error [:ref ::syntax-error]]
   [:validate/validation-error [:ref ::validation-error]]])
