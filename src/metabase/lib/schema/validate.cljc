(ns metabase.lib.schema.validate
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::missing-column
  [:map
   [:type [:= :query-error/missing-column]]
   [:name :string]])

(mr/def ::missing-table-alias
  [:map
   [:type [:= :query-error/missing-table-alias]]
   [:name :string]])

(mr/def ::duplicate-column
  [:map
   [:type [:= :query-error/duplicate-column]]
   [:name :string]])

(mr/def ::syntax-error
  [:map
   [:type [:= :query-error/syntax-error]]])

(mr/def ::error
  [:multi {:dispatch :type}
   [:query-error/missing-column [:ref ::missing-column]]
   [:query-error/missing-table-alias [:ref ::missing-table-alias]]
   [:query-error/duplicate-column [:ref ::duplicate-column]]
   [:query-error/syntax-error [:ref ::syntax-error]]])
