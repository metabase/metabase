(ns metabase-enterprise.entity-retrieval.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

;; The library entity index shares the global embedding configuration (`ee-embedding-*`) by default.
;; These settings override individual keys so it can run a different provider/model than semantic
;; search — e.g. the in-process embedder serves any number of models per JVM, keyed by model name.
;; Leave unset to inherit the global value.

(defsetting ee-library-embedding-provider
  (deferred-tru "Embedding provider for the library entity index; leave empty to use ee-embedding-provider.")
  :encryption :no
  :visibility :settings-manager
  :default nil
  :type :string
  :export? false
  :doc false)

(defsetting ee-library-embedding-model
  (deferred-tru "Embedding model for the library entity index; leave empty to use ee-embedding-model.")
  :encryption :no
  :visibility :settings-manager
  :default nil
  :type :string
  :export? false
  :doc false)

(defsetting ee-library-embedding-model-dimensions
  (deferred-tru "Vector dimensions of the library entity index''s embedding model; leave empty to use ee-embedding-model-dimensions.")
  :encryption :no
  :visibility :settings-manager
  :default nil
  :type :positive-integer
  :export? false
  :doc false)
