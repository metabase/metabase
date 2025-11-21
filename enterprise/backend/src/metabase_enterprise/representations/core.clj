(ns metabase-enterprise.representations.core
  "Core functionality for the representations module that enables human-writable
   formats for Metabase entities for version control and programmatic management."
  (:require
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [representations.read :as rep-read]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Validate representation structure

(defn normalize-representation
  "Validates a representation against its schema based on the type field.

   The type field can be either:
   - Simple: 'question', 'collection' (defaults to v0)
   - Versioned: 'v0/question', 'v1/collection' (explicit version)

   The schemas themselves expect simple types, so we strip the version
   before validation if present.

   Handles both string and keyword keys from YAML parsing.
   Applies JSON decoders to convert strings to appropriate types (e.g., \"scheduled\" -> :scheduled).

   Throws an exception if validation fails.
   Returns the decoded and validated representation if validation passes."
  [representation]
  (rep-read/parse representation))

;;;;;;;;;;;
;; Import

(defn yaml->toucan
  "Convert a validated representation into data suitable for creating/updating an entity.
   Returns a map with keys matching the Toucan model fields.
   Does NOT insert into the database - just transforms the data.
   Delegates to the multimethod yaml->toucan for extensibility."
  ([valid-representation]
   (import/yaml->toucan valid-representation nil))
  ([valid-representation ref-index]
   (import/yaml->toucan valid-representation ref-index)))

(defn insert!
  "Insert a representation into the App DB as a new entity."
  ([representation]
   (import/insert! representation (v0-common/map-entity-index {})))
  ([representation ref-index]
   (import/insert! representation ref-index)))

(defn update!
  "Update an existing representation into the App DB given its PK id."
  ([representation id]
   (import/update! representation id (v0-common/map-entity-index {})))
  ([representation id ref-index]
   (import/update! representation id ref-index)))

;; =============================================================== ;;

(defn export
  "Export a Metabase entity to its human-readable representation.
   Delegates to the multimethod export-entity for extensibility."
  [t2-model]
  (export/export-entity t2-model))

(defn export-collection-nested
  "Export a collection and all its contents."
  ([collection-id]
   (export/export-entire-collection collection-id)))

(defn export-set
  "Export the transitive closure of the dependencies."
  ([representations]
   (export/export-set representations)))

(defn order-representations
  "Topologically sort the representations."
  ([representations]
   (v0-common/order-representations representations)))
