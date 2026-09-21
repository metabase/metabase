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
   ;; checked with `:fn` rather than a `[:map [:source-table ...]]` conjunct: a map conjunct declares only the keys it
   ;; names, so it would strip every other key of the stage before the sibling `::lib.schema/stage.mbql` saw it
   [:fn
    {:error/message "A measure stage must have a :source-table"}
    #(mr/validate ::lib.schema.id/table (:source-table %))]
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
   ;; likewise `:fn` rather than a `[:map [:stages ...]]` conjunct, which would strip every other key of the query
   [:fn
    {:error/message "A measure definition's stages must be measure stages"}
    #(mr/validate [:sequential [:ref ::stage]] (:stages %))]])
