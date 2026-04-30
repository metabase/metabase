(ns metabase-enterprise.similarity.models.similarity-pagerank
  "Per-scope PageRank output rows.

   One row per `(scope, entity_type, entity_id)`. `score` is the raw Brin-Page
   value (sums to ~1.0 within scope). `rank` is the 1-based dense ordinal
   within scope, score-desc with `entity_id`-asc tiebreaks.

   Phase 8 ships `:full` (polymorphic across types) and `:card`/`:dashboard`/
   `:table` (per-type) scopes. `:collection` scope is Phase 11."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SimilarityPagerank [_model]
  :similarity_pagerank)

(derive :model/SimilarityPagerank :metabase/model)

(t2/deftransforms :model/SimilarityPagerank
  {:scope       mi/transform-keyword
   :entity_type mi/transform-keyword})
