(ns metabase-enterprise.transforms-inspector.core
  "EE Transform Inspector core — lens discovery and retrieval.
   Delegates to context and lens modules for the heavy lifting."
  (:require
   [metabase-enterprise.transforms-inspector.context :as context]
   [metabase-enterprise.transforms-inspector.lens.column-comparison]
   [metabase-enterprise.transforms-inspector.lens.core :as lens.core]
   [metabase-enterprise.transforms-inspector.lens.generic]
   [metabase-enterprise.transforms-inspector.lens.join-analysis]
   [metabase-enterprise.transforms-inspector.lens.unmatched-rows]
   [metabase-enterprise.transforms-inspector.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(comment
  metabase-enterprise.transforms-inspector.lens.generic/keep-me
  metabase-enterprise.transforms-inspector.lens.column-comparison/keep-me
  metabase-enterprise.transforms-inspector.lens.join-analysis/keep-me
  metabase-enterprise.transforms-inspector.lens.unmatched-rows/keep-me)

(mu/defn discover-lenses :- :metabase-enterprise.transforms-inspector.schema/discovery-response
  "Discover available lenses for a transform.
   Returns structural metadata and available lens types.
   This is a cheap operation - no query execution."
  [transform :- :map]
  (let [{:keys [sources target] :as ctx} (context/build-context transform)]
    (if-not target
      {:name             (tru "Transform Inspector: {0}" (:name transform))
       :description      (tru "Transform has not been run yet.")
       :status           :not-run
       :sources          sources
       :target           nil
       :available_lenses []}
      {:name             (tru "Transform Inspector: {0}" (:name transform))
       :description      (tru "Analysis of transform inputs, outputs, and joins")
       :status           :ready
       :sources          sources
       :target           target
       :visited_fields   (:visited-fields ctx)
       :available_lenses (lens.core/available-lenses ctx)})))

(mu/defn get-lens :- :metabase-enterprise.transforms-inspector.schema/lens
  "Get full lens contents for a transform.
   Returns sections, cards, and trigger definitions.
   Optional params can filter/customize drill lens output."
  [transform :- :map
   lens-id :- :string
   params :- [:maybe :map]]
  (let [ctx (context/build-context transform)]
    (lens.core/get-lens ctx lens-id params)))
