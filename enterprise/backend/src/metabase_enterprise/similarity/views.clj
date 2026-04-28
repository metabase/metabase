(ns metabase-enterprise.similarity.views
  "Registry of similarity view names. Analogue of
   `metabase-enterprise.dependencies.dependency-types` for the similarity graph.

   Every `ViewScorer` registers a view under one of these names. `:ensemble` is
   reserved for materialized RRF-fused rows that downstream consumers query."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def view-names
  "The set of all known similarity view names. Add to this when registering a
   new ViewScorer. Phase 1 ships only the structural floor; later phases extend."
  #{:direct-dependency
    :co-dashboard
    :source-table-jaccard
    :co-execution
    :field-jaccard-idf
    :ensemble})

(mr/def ::view-name
  (ms/enum-decode-keyword view-names))
