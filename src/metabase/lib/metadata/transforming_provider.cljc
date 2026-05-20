(ns metabase.lib.metadata.transforming-provider
  "A metadata provider that transforms results by applying a function `f` to every `metadatas` call.
   See [[transforming-metadata-provider]]."
  (:require
   #?@(:clj ([pretty.core :as pretty]))
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.invocation-tracker :as lib.metadata.invocation-tracker]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

(deftype TransformingMetadataProvider [f parent-metadata-provider]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (lib.metadata.protocols/database parent-metadata-provider))
  (metadatas [_this metadata-spec]
    (f metadata-spec (lib.metadata.protocols/metadatas parent-metadata-provider metadata-spec)))
  (setting [_this setting-key]
    (lib.metadata.protocols/setting parent-metadata-provider setting-key))

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
  "Wrap `parent-metadata-provider` with a transform function `f`. `f` receives `(f metadata-spec results)`
   for every call to `metadatas` and should return the (possibly transformed) results.
   The returned provider is wrapped in a fresh cache and invocation tracker."
  [f parent-metadata-provider]
  (-> (->TransformingMetadataProvider f parent-metadata-provider)
      ;; throws away cache
      lib.metadata.cached-provider/cached-metadata-provider
      ;; throws away underlying invocation tracking
      lib.metadata.invocation-tracker/invocation-tracker-provider))
