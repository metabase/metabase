(ns metabase-enterprise.transforms.inspector-v2
  "Transform Inspector v2 API.

   Two-phase lens-based approach:
   - Phase 1 (discover-lenses): Returns sources, target, available lenses
   - Phase 2 (get-lens): Returns sections and cards for a specific lens"
  (:require
   [metabase-enterprise.transforms.inspector-v2.context :as context]
   [metabase-enterprise.transforms.inspector-v2.lens.column-comparison]
   [metabase-enterprise.transforms.inspector-v2.lens.core :as lens.core]
   [metabase-enterprise.transforms.inspector-v2.lens.generic]
   [metabase-enterprise.transforms.inspector-v2.lens.join-analysis]
   [metabase-enterprise.transforms.inspector-v2.lens.unmatched-rows]
   [metabase-enterprise.transforms.inspector-v2.schema :as schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

;; Force load lens implementations
(comment
  metabase-enterprise.transforms.inspector-v2.lens.generic/keep-me
  metabase-enterprise.transforms.inspector-v2.lens.column-comparison/keep-me
  metabase-enterprise.transforms.inspector-v2.lens.join-analysis/keep-me
  metabase-enterprise.transforms.inspector-v2.lens.unmatched-rows/keep-me)

(set! *warn-on-reflection* true)

(mu/defn discover-lenses :- ::schema/discovery-response
  "Phase 1: Discover available lenses for a transform.
   Returns structural metadata and available lens types.
   This is a cheap operation - no query execution."
  [transform :- :map]
  (let [ctx (context/build-context transform)
        {:keys [sources target]} ctx]
    (if-not target
      {:name             (str "Transform Inspector: " (:name transform))
       :description      (tru "Transform has not been run yet.")
       :status           :not-run
       :sources          sources
       :target           nil
       :available-lenses []}
      {:name             (str "Transform Inspector: " (:name transform))
       :description      (tru "Analysis of transform inputs, outputs, and joins")
       :status           :ready
       :sources          sources
       :target           target
       :visited-fields   (:visited-fields ctx)
       :available-lenses (lens.core/available-lenses ctx)})))

(mu/defn get-lens :- ::schema/lens
  "Phase 2: Get full lens contents for a transform.
   Returns sections, cards, and trigger definitions.
   Optional params can filter/customize drill lens output."
  [transform :- :map
   lens-id :- :string
   params :- [:maybe :map]]
  (let [ctx (context/build-context transform)]
    (lens.core/get-lens ctx lens-id params)))
