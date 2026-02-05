(ns metabase.transforms.inspector
  "Transform Inspector API."
  (:require
   [metabase.transforms.inspector.context :as context]
   [metabase.transforms.inspector.lens.column-comparison]
   [metabase.transforms.inspector.lens.core :as lens.core]
   [metabase.transforms.inspector.lens.generic]
   [metabase.transforms.inspector.lens.join-analysis]
   [metabase.transforms.inspector.lens.unmatched-rows]
   [metabase.transforms.inspector.schema :as schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(comment
  metabase.transforms.inspector.lens.generic/keep-me
  metabase.transforms.inspector.lens.column-comparison/keep-me
  metabase.transforms.inspector.lens.join-analysis/keep-me
  metabase.transforms.inspector.lens.unmatched-rows/keep-me)

(set! *warn-on-reflection* true)

(mu/defn discover-lenses :- ::schema/discovery-response
  "Discover available lenses for a transform.
   Returns structural metadata and available lens types.
   This is a cheap operation - no query execution."
  [transform :- :map]
  (let [{:keys [sources target] :as ctx} (context/build-context transform)]
    (if-not target
      {:name             (str "Transform Inspector: " (:name transform))
       :description      (tru "Transform has not been run yet.")
       :status           :not-run
       :sources          sources
       :target           nil
       :available_lenses []}
      {:name             (str "Transform Inspector: " (:name transform))
       :description      (tru "Analysis of transform inputs, outputs, and joins")
       :status           :ready
       :sources          sources
       :target           target
       :visited_fields   (:visited_fields ctx)
       :available_lenses (lens.core/available-lenses ctx)})))

(mu/defn get-lens :- ::schema/lens
  "Get full lens contents for a transform.
   Returns sections, cards, and trigger definitions.
   Optional params can filter/customize drill lens output."
  [transform :- :map
   lens-id :- :string
   params :- [:maybe :map]]
  (let [ctx (context/build-context transform)]
    (lens.core/get-lens ctx lens-id params)))
