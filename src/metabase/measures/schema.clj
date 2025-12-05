(ns metabase.measures.schema
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::stage.measures
  [:and
   ::lib.schema/stage.mbql
   [:fn
    {:error/message "A measure stage must have :source-table"}
    #(contains? % :source-table)]
   [:fn
    {:error/message "A measure stage must have exactly 1 :aggregation"}
    #(= (count (:aggregation %)) 1)]
   (common/disallowed-keys
    {:joins       "Measures cannot use :joins"
     :expressions "Measures cannot use :expressions"
     :filters     "Measures cannot use :filters"
     :breakout    "Measures cannot use :breakout"
     :fields      "Measures cannot use :fields"
     :order-by    "Measures cannot use :order-by"
     :page        "Measures cannot use :page"
     :limit       "Measures cannot use :limit"})])

(mr/def ::measure
  [:and
   ::lib.schema/query
   [:fn
    {:error/message "A measure must have exactly one stage"}
    #(= (-> % :stages count) 1)]
   [:map
    [:stages [:sequential [:ref ::stage.measures]]]]])
