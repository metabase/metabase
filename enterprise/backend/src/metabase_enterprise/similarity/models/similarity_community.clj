(ns metabase-enterprise.similarity.models.similarity-community
  "Per-type Louvain community membership + within-community PageRank centrality.

   Communities are computed per-type only (synth doc §7: cross-type
   communities are usually noise). `community_id` is an integer assigned at
   compute time and is **not stable across rebuilds** — Phase 11 will pick up
   stable-id matching via Jaccard overlap if the PoC graduates. PoC consumers
   re-derive labels per run.

   `centrality` is the within-community PageRank score over the
   Louvain-input subgraph; it identifies canonical representatives in
   `dedupe-by-community` and the suggested-prompts seed."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SimilarityCommunity [_model]
  :similarity_community)

(derive :model/SimilarityCommunity :metabase/model)

(t2/deftransforms :model/SimilarityCommunity
  {:scope       mi/transform-keyword
   :entity_type mi/transform-keyword})
