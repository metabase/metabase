(ns metabase-enterprise.content-diagnostics.schema)

(def entity-types
  "Every entity type a finding can be about."
  #{:card :collection :dashboard :document :transform})

(def non-collection-entity-types
  "Every entity type but `:collection`: what the stale checker scans, and the `/stale` and `/slow`
  filter vocabulary."
  (disj entity-types :collection))
