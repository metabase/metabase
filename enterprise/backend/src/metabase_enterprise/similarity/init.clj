(ns metabase-enterprise.similarity.init
  "Side-effect loads for the polymorphic similarity graph module. Registers
   Toucan2 models and view scorers; Quartz scheduling and event hooks land in
   Phase 10."
  (:require
   [metabase-enterprise.similarity.api]
   [metabase-enterprise.similarity.fusion]
   [metabase-enterprise.similarity.graph.edge-loader]
   [metabase-enterprise.similarity.graph.louvain]
   [metabase-enterprise.similarity.graph.pagerank]
   [metabase-enterprise.similarity.graph.runner]
   [metabase-enterprise.similarity.models.similar-edge]
   [metabase-enterprise.similarity.models.similar-edge-status]
   [metabase-enterprise.similarity.models.similarity-community]
   [metabase-enterprise.similarity.models.similarity-pagerank]
   [metabase-enterprise.similarity.overlay]
   [metabase-enterprise.similarity.runner]
   [metabase-enterprise.similarity.scorer]
   [metabase-enterprise.similarity.util]
   [metabase-enterprise.similarity.views]
   ;; View namespaces register themselves on load.
   [metabase-enterprise.similarity.views.co-dashboard]
   [metabase-enterprise.similarity.views.co-execution]
   [metabase-enterprise.similarity.views.direct-dependency]
   [metabase-enterprise.similarity.views.ensemble]
   [metabase-enterprise.similarity.views.field-jaccard-idf]
   [metabase-enterprise.similarity.views.source-table-jaccard]
   [metabase-enterprise.similarity.views.title-desc-ebr]))
