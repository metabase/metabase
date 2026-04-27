(ns metabase-enterprise.similarity.init
  "Side-effect loads for the polymorphic similarity graph module. Phase 1
   only registers Toucan2 models and the view-name registry; later phases add
   scorers, fusion, an API, Quartz tasks, and event hooks."
  (:require
   [metabase-enterprise.similarity.models.similar-edge]
   [metabase-enterprise.similarity.models.similar-edge-status]
   [metabase-enterprise.similarity.views]))
