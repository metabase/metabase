(ns metabase.metrics.transforms
  "Shared JSON transform functions for dimension and dimension-mapping columns
   used by both Card and Measure models.

   Dimensions are kebab-case (`display-name`, `dimension-id`, …) everywhere — in memory,
   on the wire, and in the JSON at rest — the shape
   [[metabase.lib-metric.schema/persisted-dimension]] describes, matching master and the
   metric-dimensions branch. No key-casing conversion or legacy-shape detection happens
   here; rows in another shape must be wiped/re-synced (dimensions are derived data —
   `metabase.metrics.core/sync-dimensions!` recomputes them)."
  (:require
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]))

(mu/defn normalize-dimension :- ::lib-metric.schema/persisted-dimension
  "Normalize a dimension after JSON parsing. This is the single boundary at which the
   canonical shape consumed downstream is enforced — keys are kebab-case and type values
   (`:effective-type`, `:semantic-type`, `:has-field-values`, `:status`, `:sources[].type`)
   are keywords, and the output conforms to [[lib-metric.schema/persisted-dimension]]
   (validated by `mu/defn`). Downstream readers should trust the shape and skip defensive
   kw/str coercion."
  [dim :- :map]
  (cond-> dim
    (:status dim)           (update :status keyword)
    (:effective-type dim)   (update :effective-type keyword)
    (:semantic-type dim)    (update :semantic-type keyword)
    (:has-field-values dim) (update :has-field-values keyword)
    (:sources dim)          (update :sources (fn [srcs] (mapv #(update % :type keyword) srcs)))))

(defn- canonicalize-legacy-expression-ref
  "`lib/normalize` relocates a legacy `:field` ref's id into MBQL-5 position (opts before id), but
   the `:expression` ref schema has no such handler, so a legacy `[\"expression\" name]` /
   `[\"expression\" name opts]` gets read as `[tag opts name]` and loses its name (yielding
   `[:expression {} nil]`). Reshape those into MBQL-5 order `[\"expression\" opts name]` first. An
   already-MBQL-5 ref (options map in the id slot) is returned untouched."
  [target]
  (if (and (sequential? target)
           (#{"expression" :expression} (first target))
           ;; legacy shape: the expression name (a string) sits in the id/index-1 slot
           (string? (second target)))
    (let [[tag nm opts] target]
      [tag (or opts {}) nm])
    target))

(defn normalize-target-ref
  "Normalize a target ref after JSON parsing, e.g. [\"field\" {...} id] to a well-formed
   MBQL 5 [:field {...} id] ref, via the ref schema."
  [target]
  (lib/normalize :metabase.lib.schema.ref/ref (canonicalize-legacy-expression-ref target)))

(defn normalize-dimension-mapping
  "Normalize a dimension mapping after JSON parsing, converting string values to keywords."
  [mapping]
  (-> mapping
      (update :type keyword)
      (update :target normalize-target-ref)))

(def transform-dimensions
  "Transform for dimensions column. Handles JSON serialization/deserialization."
  {:in mi/json-in
   :out (fn [dims]
          (some->> dims
                   mi/json-out-with-keywordization
                   (mapv normalize-dimension)))})

(def transform-dimension-mappings
  "Transform for dimension_mappings column. Handles JSON serialization/deserialization."
  {:in mi/json-in
   :out (fn [mappings]
          (some->> mappings
                   mi/json-out-with-keywordization
                   (mapv normalize-dimension-mapping)))})
