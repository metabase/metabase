(ns metabase.lib-be.metadata.snippets-only
  "Metadata provider specialized for snippet operations that don't require a database context.

   This provider is designed for use cases where we need to fetch and validate snippets
   without having a specific database context, such as when checking for circular references
   during snippet save operations."
  (:require
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.invocation-tracker :as lib.metadata.invocation-tracker]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [potemkin :as p]
   [toucan2.core :as t2]))

(p/deftype+ UncachedSnippetsOnlyMetadataProvider []
  lib.metadata.protocols/MetadataProvider

  (database [_this]
    ;; Snippets are not database-specific
    nil)

  (metadatas [_this metadata-type ids]
    (case metadata-type
      :metadata/native-query-snippet
      (when (seq ids)
        (vec (t2/select :metadata/native-query-snippet :id [:in ids])))
      ;; Return empty for other metadata types
      []))

  (metadatas-by-name [_this metadata-type names]
    (case metadata-type
      :metadata/native-query-snippet
      (when (seq names)
        (vec (t2/select :metadata/native-query-snippet :name [:in names])))
      ;; Return empty for other metadata types
      []))

  (tables [_this]
    ;; No tables in snippets-only context
    [])

  (metadatas-for-table [_this _metadata-type _table-id]
    ;; No table metadata in snippets-only context
    [])

  (metadatas-for-card [_this _metadata-type _card-id]
    ;; No card metadata in snippets-only context
    [])

  (setting [_this _setting-key]
    ;; No settings in snippets-only context
    nil))

(defn snippets-only-metadata-provider
  "Creates a metadata provider that only handles native query snippets.
   This provider includes caching to avoid repeated database queries.

   Use this when you need to work with snippets outside of a specific
   database context, such as during snippet validation."
  []
  (-> (->UncachedSnippetsOnlyMetadataProvider)
      lib.metadata.cached-provider/cached-metadata-provider
      lib.metadata.invocation-tracker/invocation-tracker-provider))
