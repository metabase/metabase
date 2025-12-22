(ns metabase.measures.schema
  "Schema definitions for Measures. A Measure is a saved MBQL aggregation expression tied to a table."
  (:require
   [clojure.walk :as walk]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as common]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli.registry :as mr]))

(defn- contains-metric-reference?
  "Walk a clause and return true if it contains any `:metric` reference."
  [clause]
  (let [found? (volatile! false)]
    (walk/prewalk
     (fn [x]
       (when (lib.util/clause-of-type? x :metric)
         (vreset! found? true))
       x)
     clause)
    @found?))

(mr/def ::stage.measure
  "Schema for a single stage in a measure definition.
   A measure stage must have exactly one aggregation and no other query clauses."
  [:and
   ::lib.schema/stage.mbql
   [:fn
    {:error/message "A measure stage must have exactly one of :source-table or :source-card"}
    #(= (count (select-keys % [:source-table :source-card])) 1)]
   [:fn
    {:error/message "A measure stage must have exactly one aggregation"}
    #(= (count (:aggregation %)) 1)]
   [:fn
    {:error/message "Measures cannot reference metrics"}
    #(not (contains-metric-reference? (:aggregation %)))]
   (common/disallowed-keys
    {:joins       "Measures cannot use :joins"
     :expressions "Measures cannot use :expressions"
     :breakout    "Measures cannot use :breakout"
     :filters     "Measures cannot use :filters"
     :fields      "Measures cannot use :fields"
     :order-by    "Measures cannot use :order-by"
     :page        "Measures cannot use :page"
     :limit       "Measures cannot use :limit"})])

(mr/def ::measure
  "Schema for a complete measure definition.
   A measure is a single-stage MBQL query with exactly one aggregation."
  [:and
   ::lib.schema/query
   [:fn
    {:error/message "A measure must have exactly one stage"}
    #(= (-> % :stages count) 1)]
   [:map
    [:stages [:sequential [:ref ::stage.measure]]]]])
