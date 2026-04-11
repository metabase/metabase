(ns metabase.lib-be.json-schema
  "Create JSON schema for MBQL 5 queries based on Malli schema.

  Malli already has built-in functionality for this. Why not just use it?

  It sometimes emits branching nodes like :allOf, :anyOf, :oneOf with either
  one or zero children, which doesn't make any sense. These should be
  collapsed down. Empty conditions should be removed from these as well.

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
  (let [schema (update schema k (partial remove mp/empty?))]
    (case (count (k schema))
      1 (merge (dissoc schema k) (first (k schema)))
      0 (dissoc schema k)
      schema)))

(defn- update-properties [properties]
  (zipmap (map u/qualified-name (keys properties))
          (vals properties)))

(defn- dissoc-falsy [m k]
  (if (k m)
    m
    (dissoc m k)))

(defn- update-required [required]
  (if (map? required)
    required
    (map u/qualified-name required)))

(defn walk [node]
  (if (map? node)
    (-> node
        (m/update-existing :required update-required)
        (collapse-branches :allOf)
        (collapse-branches :anyOf)
        (collapse-branches :oneOf)
        (m/update-existing :properties update-properties)
        (dissoc-falsy :items)
        ;; :metabase.api.open-api/parameter.schema wants this, but jv doesn't
        ;; (m/update-existing :type keyword)
        )
    node))

(mu/defn make-schema :- map? ; :metabase.api.open-api/parameter.schema
  "Generate a schema from Malli and apply fixes."
  []
  (mp/postwalk walk (mjs/transform ::schema/query
                                  ;; TODO: this makes the validator hate it, but
                                  ;; it's required for the malli schema above to
                                  ;; validate; what gives?
                                  #_{::mjs/definitions-path "#/components/schemas/"})))

(defn print-schema
  "Print JSON Schema for MBQL5 queries, or write to a file if given."
  [{:keys [file]}]
  (let [json (json-util/encode (make-schema) {:pretty true})]
    (if file
      (spit file json)
      #_{:clj-kondo/ignore [:discouraged-var]} ; the point is to print! not to log
      (println json))))

(comment (print-schema {:file "schema.json"}))
