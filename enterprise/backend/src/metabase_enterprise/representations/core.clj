(ns metabase-enterprise.representations.core
  "Core functionality for the representations module that enables human-writable
   formats for Metabase entities for version control and programmatic management."
  (:require
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]))

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
  (import/normalize-representation representation))

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

(defn persist!
  "Persist the representation with t2"
  ([representation]
   (persist! representation nil))
  ([representation ref-index]
   (when-let [validated (normalize-representation representation)]
     (import/persist! validated ref-index))))

;; =============================================================== ;;

(defn export
  "Export a Metabase entity to its human-readable representation.
   Delegates to the multimethod export-entity for extensibility."
  [t2-model]
  (export/export-entity t2-model))

(defn export-collection-representations
  "Export a collection and all its contents to YAML files.
   Delegates to export/export-collection-representations."
  ([id]
   (export/export-collection-representations id))
  ([id path]
   (export/export-collection-representations id path)))

(defn import-collection-representations
  "Because I didn't potemkin yet."
  [id]
  (import/import-collection-representations id))
