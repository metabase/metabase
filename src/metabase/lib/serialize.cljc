(ns metabase.lib.serialize
  "Logic for preparising an MBQL 5 query for JSON serialization (for the REST API or app DB). Removes things like
  QP-specific keys added during preprocessing, and -- in the other direction -- strips those keys back out again after
  a query is deserialized."
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

(defn- deserializer [schema]
  (mr/cached ::deserializer
             schema
             (fn []
               (mc/decoder schema (mtx/transformer {:name :api})))))

(defn prepare-after-deserialization
  "Inverse of [[prepare-for-serialization]]: run on a query `x` right after it is decoded from JSON coming in from a
  REST API request or the application database, to strip the internal query-processor keys that the query processor adds
  itself during preprocessing -- after this runs -- so stripping them here has no effect on legitimately-added keys.
  Stripping logic is defined in the schemas; grep for `:decode/api` in the `metabase.lib.schema*` namespaces."
  ([x]
   (prepare-after-deserialization ::lib.schema/query x))

  ([schema x]
   ((deserializer schema) x)))
