(ns metabase.lib.serialize
  "Logic for preparising an MLv2 query for JSON serialization (for the REST API or app DB). Removes things like
  QP-specific keys added during preprocessing."
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.lib.schema :as lib.schema]
   [metabase.util.malli.registry :as mr]))

(defn- encoder [schema]
  (mr/cached ::encoder
             schema
             (fn []
               (mc/encoder schema (mtx/transformer {:name :serialize})))))

(defn prepare-for-serialization
  "Prepare `x`, usually a query, for serialization to JSON for a REST API response or for persisting into the
  application database. Removes internal-use keys added by query processor entrypoints or middleware. Encoding logic
  is defined in various schemas; grep for `:encode/serialize` in the `metabase.lib.schema*` namespaces."
  ([x]
   (prepare-for-serialization ::lib.schema/query x))

  ([schema x]
   ((encoder schema) x)))
