(ns metabase.lib.metadata.transforming-provider
  "A metadata provider that transforms results from a parent provider by applying `f` to every
   `metadatas` and `cached-metadatas` call.

   What it is
   ----------
   A read-side wrapper. Delegates the whole `CachedMetadataProvider` surface to the parent,
   intercepting only the read paths to apply `f` on the way out. The parent's atom is never
   mutated by the wrapper; the same parent can be wrapped, unwrapped, and read directly with
   no risk of pollution.

   What it solves
   --------------
   The wrapped parent may already hold canonical metadata from prior reads. Without
   interception every read through the wrapper would return canonical, defeating the
   purpose of the transform. Intercepting `metadatas` AND `cached-metadatas` ensures every
   public read path (`lib.metadata/table`, `field`, `tables`, `lib.metadata/cached-metadata`,
   `cached-metadatas`) returns the transformed shape.

   Why it works
   ------------
   - `metadatas` applies `f` on the way out. Parent serves canonical from its cache;
     wrapper transforms; caller sees transformed.
   - `cached-metadatas` does the same. Without this, callers reaching the parent's cache
     directly via the `CachedMetadataProvider` API would bypass `f`.
   - `store-metadata!`, `cache-value!`, `cached-value`, `clear-cache!`, `has-cache?` all
     delegate to the parent. The wrapper has no opinion about non-read operations; whatever
     the parent does is what happens.

   `f` must be pure."
  (:require
   #?@(:clj ([potemkin :as p]
             [pretty.core :as pretty]))
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

(#?(:clj p/deftype+ :cljs deftype) TransformingMetadataProvider [f parent-metadata-provider]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (lib.metadata.protocols/database parent-metadata-provider))
  (metadatas [_this metadata-spec]
    (f metadata-spec (lib.metadata.protocols/metadatas parent-metadata-provider metadata-spec)))
  (setting [_this setting-key]
    (lib.metadata.protocols/setting parent-metadata-provider setting-key))

  lib.metadata.protocols/CachedMetadataProvider
  (cached-metadatas [_this metadata-type metadata-ids]
    (f {:lib/type metadata-type}
       (lib.metadata.protocols/cached-metadatas parent-metadata-provider metadata-type metadata-ids)))
  (store-metadata! [_this metadata]
    (lib.metadata.protocols/store-metadata! parent-metadata-provider metadata))
  (cached-value [_this k not-found]
    (lib.metadata.protocols/cached-value parent-metadata-provider k not-found))
  (cache-value! [_this k v]
    (lib.metadata.protocols/cache-value! parent-metadata-provider k v))
  (has-cache? [_this]
    (lib.metadata.protocols/has-cache? parent-metadata-provider))
  (clear-cache! [_this]
    (lib.metadata.protocols/clear-cache! parent-metadata-provider))

  lib.metadata.protocols/InvocationTracker
  (invoked-ids [_this metadata-type]
    (when (satisfies? lib.metadata.protocols/InvocationTracker parent-metadata-provider)
      (lib.metadata.protocols/invoked-ids parent-metadata-provider metadata-type)))

  #?(:clj Object :cljs IEquiv)
  (#?(:clj equals :cljs -equiv) [_this another]
    (and (instance? TransformingMetadataProvider another)
         (= f (.-f ^TransformingMetadataProvider another))
         (= parent-metadata-provider (.-parent-metadata-provider ^TransformingMetadataProvider another))))

  #?@(:clj
      [pretty/PrettyPrintable
       (pretty [_this]
               (list `transforming-metadata-provider f parent-metadata-provider))]))

(defn transforming-metadata-provider
  "Wrap `parent-metadata-provider` with a transform function `f`. `f` receives
   `(f metadata-spec results)` for every `metadatas` and `cached-metadatas` call on the
   wrapper, and returns the (possibly transformed) results.

   `f` must be pure."
  [f parent-metadata-provider]
  (->TransformingMetadataProvider f parent-metadata-provider))
