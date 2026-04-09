(ns metabase.lib-be.json-schema
  "Create JSON schema for MBQL 5 queries based on Malli schema.

  Malli already has built-in functionality for this. Why not just use it?

  It sometimes emits branching nodes like :allOf, :anyOf, :oneOf with either
  one or zero children, which doesn't make any sense. These should be
  collapsed down.

  Malli sometimes emits :items as `false` for arrays.

  Our schema for what constitutes a valid JSON schema is a little stricter
  about what the keys have to look like; for instance types must always be
  keywords despite the fact that we're emitting them as JSON in the end so
  it doesn't really matter.

  This code was originally based on metabase.api.macros.defendpoint.open-api
  but it removes some things that are not relevant for JSON schemas in general."
  (:require
   [malli.json-schema :as mjs]
   [medley.core :as m]
   [metabase.lib.schema :as schema]
   [metabase.util :as u]
   [metabase.util.json :as json-util]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as mp]))

(defn- collapse-branches [schema k]
  ;; this happens when we use `[:and ... [:fn ...]]`, the `:fn` schema
  ;; gets converted into an empty object in :allOf
  (case (count (k schema))
    1 (merge (dissoc schema k) (first (k schema)))
    0 (dissoc schema k)
    schema))

(defn- update-properties [properties]
  (zipmap (map u/qualified-name (keys properties)) (vals properties)))

(defn- update-items [m]
  (if (false? (:items m))
    (dissoc m :items)
    m))

(defn- walk-map [m]
  (-> m
      (m/update-existing :required (partial map u/qualified-name))
      (collapse-branches :allOf)
      (collapse-branches :anyOf)
      (collapse-branches :oneOf)
      (m/update-existing :properties update-properties)
      (update-items)
      (m/update-existing :type keyword)))

(defn- walk [node]
  (cond (map? node) (walk-map node)
        (vector? node) (mp/mapv walk node)
        (sequential? node) (mp/mapv walk node)
        :else node))

(mu/defn make-schema :- :metabase.api.open-api/parameter.schema
  "Generate a schema from Malli and apply fixes."
  []
  (mp/prewalk walk (mjs/transform ::schema/query
                                  {::mjs/definitions-path "#/components/schemas/"})))

(defn -main
  "Print JSON Schema for MBQL5 queries."
  []
  (-> (make-schema)
      (json-util/encode {:pretty true})
      (println)))
