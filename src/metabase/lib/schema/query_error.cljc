(ns metabase.lib.schema.query-error
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

(mu/defn missing-column :- [:ref ::missing-column]
  [name :- :string]
  {:type :query-error/missing-column
   :name name})

(mu/defn missing-table-alias :- [:ref ::missing-table-alias]
  [name :- :string]
  {:type :query-error/missing-table-alias
   :name name})

(mu/defn duplicate-column :- [:ref ::duplicate-column]
  [name :- :string]
  {:type :query-error/duplicate-column
   :name name})

(mu/defn syntax-error :- [:ref ::syntax-error]
  []
  {:type :query-error/syntax-error})
