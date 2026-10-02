(ns metabase-enterprise.content-diagnostics.schema
  "Vocabulary shared across the Content Diagnostics module. Requires nothing module-internal, so `db` can
  depend on it without breaking its leaf status.")

(def entity-types
  "Every entity type a finding can be about."
  #{:card :collection :dashboard :document :transform})
