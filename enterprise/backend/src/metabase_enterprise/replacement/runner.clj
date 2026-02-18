(ns metabase-enterprise.replacement.runner
  (:require
   [metabase-enterprise.replacement.field-refs :as field-refs]
   [metabase-enterprise.replacement.source :as source]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.util.malli :as mu]))

(mu/defn run-swap
  "Replace all usages of `old-source` with `new-source` across all dependent entities.

   Both arguments are [type id] pairs like [:card 123] or [:table 45].

   Example:
     (swap-source [:card 123] [:card 789])

   This finds all entities that depend on the old source and updates their queries
   to reference the new source instead.

   Returns {:swapped [...]} with the list of entities that were updated."
  [old-source :- ::source/source-ref
   new-source :- ::source/source-ref]
  ;; TODO (eric 2026-02-18): Check for cycles!
  ;; phase 1: Upgrade all field refs
  (doseq [entity (usages/transitive-usages old-source)]
    (field-refs/upgrade! entity))

  ;; phase 2: Swap the sources

  #_(let [found-usages (usages/usages old-source)]
      (doseq [[entity-type entity-id] found-usages]
        (update-entity entity-type entity-id old-source new-source))
      {:swapped (vec found-usages)}))
