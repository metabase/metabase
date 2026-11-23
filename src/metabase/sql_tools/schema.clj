(ns metabase.sql-tools.schema
  "Malli schemas for the SQL tools module."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::shadow-difference.changes
  "What a sighting of a SqlParsingShadowDifference stores: its newest outcome and the results of both parsers."
  [:map {:closed true}
   [:outcome        :string]
   [:primary_result [:maybe :string]]
   [:shadow_result  [:maybe :string]]])

(mr/def ::shadow-difference.create
  "What creating a SqlParsingShadowDifference takes: the hash and description of its input, and its first sighting."
  [:merge
   ::shadow-difference.changes
   [:map {:closed true}
    [:input_hash      :string]
    [:method          :string]
    [:dialect         [:maybe :string]]
    [:primary_backend :string]
    [:shadow_backend  :string]
    [:sql             [:maybe :string]]
    [:arguments       [:maybe :string]]]])
