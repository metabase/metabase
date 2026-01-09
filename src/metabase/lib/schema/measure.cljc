(ns metabase.lib.schema.measure
  "Schema definitions for Measure definitions. A Measure is a saved MBQL aggregation expression tied to a table."
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [prewalk]]))

(defn- contains-metric-reference?
  "Walk a clause and return true if it contains any `:metric` reference."
  [clause]
  (let [found? (volatile! false)]
    (prewalk
     (fn [x]
       (when (lib.util/clause-of-type? x :metric)
         (vreset! found? true))
       x)
     clause)
    @found?))

(mr/def ::stage
  "Schema for a single stage in a measure definition.
   A measure stage must have exactly one aggregation and no other query clauses."
  [:and
   ::lib.schema/stage.mbql
   [:map [:source-table ::lib.schema.id/table]]
   [:fn
    {:error/message "A measure stage must have exactly one aggregation"}
    #(= (count (:aggregation %)) 1)]
   [:fn
    {:error/message "Measures cannot reference metrics"}
    #(not (contains-metric-reference? (:aggregation %)))]
   (lib.schema.common/disallowed-keys
    {:source-card "Measures cannot use :source-card"
     :joins       "Measures cannot use :joins"
     :expressions "Measures cannot use :expressions"
     :breakout    "Measures cannot use :breakout"
     :filters     "Measures cannot use :filters"
     :fields      "Measures cannot use :fields"
     :order-by    "Measures cannot use :order-by"
     :page        "Measures cannot use :page"
     :limit       "Measures cannot use :limit"})])

(mr/def ::definition
  "Schema for a complete measure definition.
   A measure is a single-stage MBQL query with exactly one aggregation."
  [:and
   ::lib.schema/query
   [:fn
    {:error/message "A measure must have exactly one stage"}
    #(= (-> % :stages count) 1)]
   [:map
    [:stages [:sequential [:ref ::stage]]]]])
