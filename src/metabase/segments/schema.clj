(ns metabase.segments.schema
  (:require
   [malli.core :as mc]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::stage.segment
  [:and
   ::lib.schema/stage.mbql
   [:fn
    {:error/message "A segment stage must have exactly one of :source-table or :source-card"}
    #(= (count (select-keys % [:source-table :source-card])) 1)]
   [:fn
    {:error/message "A segment stage must have filters"}
    #(contains? % :filters)]
   (common/disallowed-keys
    {:joins       "Segments cannot use :joins"
     :expressions "Segments cannot use :expressions"
     :breakout    "Segments cannot use :breakout"
     :aggregation "Segments cannot use :aggregation"
     :fields      "Segments cannot use :fields"
     :order-by    "Segments cannot use :order-by"
     :page        "Segments cannot use :page"
     :limit       "Segments cannot use :limit"})])

(mr/def ::segment
  [:and
   ::lib.schema/query
   [:fn
    {:error/message "A segment must have exactly one stage"}
    #(= (-> % :stages count) 1)]
   ;; `::mc/default` because this conjunct only narrows `:stages` -- every other key of the query is the sibling
   ;; `::lib.schema/query`'s business, and would otherwise be stripped here before reaching it
   [:map
    [::mc/default :any]
    [:stages [:sequential [:ref ::stage.segment]]]]])
