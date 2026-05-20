(ns metabase.lib.metadata.transforming-provider
  "A metadata provider that transforms results from a parent provider by applying `f` to every
   `metadatas` call. See [[transforming-metadata-provider]] for the contract."
  (:require
   #?@(:clj ([pretty.core :as pretty]))
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util.log :as log]))

;;; ============================================================================
;;; What it is
;;; ============================================================================
;;;
;;; A metadata-provider wrapper that delegates to `parent-metadata-provider` and
;;; applies a transform function `f` to every read result. `cache-value!` and
;;; `cached-value` namespace their keys with `transform-id` before reaching the
;;; parent, so the wrapper occupies its own keyspace partition inside the
;;; parent's general-cache atom.
;;;
;;; What it solves
;;; ----------------------------------------------------------------------------
;;;
;;; Within a `with-metadata-provider-cache` scope, every caller asking for a
;;; given `database-id` receives the same `CachedProxyMetadataProvider`
;;; instance. If two workspaces wrap that shared parent with different
;;; transforms, both call paths memoize derived values (e.g.
;;; `lib.metadata.calculation/visible-columns`) in the parent's general-cache
;;; under keys that carry only query shape, not lens identity. The two
;;; workspaces collide on a single key; one workspace reads the other's
;;; answer.
;;;
;;; Why it works
;;; ----------------------------------------------------------------------------
;;;
;;; - `transform-id` (a value-equal identifier for the transform) is prefixed
;;;   onto every key the wrapper writes or reads through the general-cache.
;;;   Two distinct transforms occupy two distinct partitions in the same
;;;   atom; same-transform requests share their partition.
;;; - Read paths (`metadatas`, `cached-metadatas`) apply `f` on the way out
;;;   so the lens is honored regardless of which read API a caller uses.
;;; - `store-metadata!` throws to prevent writes-through-a-lens from
;;;   corrupting the parent's canonical cache.
;;; - `clear-cache!` is a no-op; the wrapper is request-scoped so GC
;;;   retires its partition alongside the wrapper instance.
;;;
;;; Contract on `f`: pure; applies per-type logic only to the intended
;;; `:lib/type` and passes other types through.
;;;
;;; Contract on `transform-id`: value-equal across reconstructions for the
;;; same transform; distinct across distinct transforms. For workspace
;;; remapping the recommended id is `(hash remappings)`.

(def ^:private general-cache-tag
  ::transforming-provider-cached-value)

(defn- tagged-key [transform-id k]
  [general-cache-tag transform-id k])

(deftype TransformingMetadataProvider [transform-id f parent-metadata-provider]
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
  (store-metadata! [_this _metadata]
    (throw (ex-info (str "store-metadata! is not supported on TransformingMetadataProvider. "
                         "Writes must be made directly against the underlying provider so transformed "
                         "values cannot corrupt the parent's canonical cache.")
                    {:transform-id transform-id})))
  (cached-value [_this k not-found]
    (lib.metadata.protocols/cached-value parent-metadata-provider (tagged-key transform-id k) not-found))
  (cache-value! [_this k v]
    (lib.metadata.protocols/cache-value! parent-metadata-provider (tagged-key transform-id k) v))
  (has-cache? [_this]
    (lib.metadata.protocols/has-cache? parent-metadata-provider))
  (clear-cache! [_this]
    (log/debug "clear-cache! is a no-op on TransformingMetadataProvider; clear the underlying provider directly if needed")
    nil)

  #?(:clj Object :cljs IEquiv)
  (#?(:clj equals :cljs -equiv) [_this another]
    (and (instance? TransformingMetadataProvider another)
         (= transform-id (.-transform-id ^TransformingMetadataProvider another))
         (= f (.-f ^TransformingMetadataProvider another))
         (= parent-metadata-provider (.-parent-metadata-provider ^TransformingMetadataProvider another))))

  #?@(:clj
      [pretty/PrettyPrintable
       (pretty [_this]
               (list `transforming-metadata-provider transform-id f parent-metadata-provider))]))

(defn transforming-metadata-provider
  "Wrap `parent-metadata-provider` with a transform function `f`. `f` receives
   `(f metadata-spec results)` for every `metadatas` and `cached-metadatas`
   call on the wrapper, and returns the (possibly transformed) results.

   `transform-id` is a stable, value-equal identifier that namespaces
   general-cache keys; distinct transforms must produce distinct ids. For
   workspace remapping the recommended id is `(hash remappings)`.

   `f` must be pure and type-scoped (apply per-type logic only to the
   intended `:lib/type`; pass other types through unchanged).

   See the namespace-level docstring for what this provider solves and why
   it works."
  [transform-id f parent-metadata-provider]
  (->TransformingMetadataProvider transform-id f parent-metadata-provider))
