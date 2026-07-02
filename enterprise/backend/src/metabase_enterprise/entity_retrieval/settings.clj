(ns metabase-enterprise.entity-retrieval.settings
  (:require
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

;; The library entity index shares the global embedding configuration (`ee-embedding-*`) by default.
;; These settings override individual keys so it can run a different provider/model than semantic
;; search — e.g. the in-process embedder serves any number of models per JVM, keyed by model name.
;; Leave unset to inherit the global value. Model and dimensions must be overridden together
;; (enforced at use): pairing either with the global value for the other would mismatch the model
;; and its vector width.

(defsetting ee-library-embedding-provider
  (deferred-tru "Embedding provider for the library entity index; leave empty to use ee-embedding-provider.")
  :encryption :no
  :visibility :settings-manager
  :default nil
  :type :string
  :export? false
  :doc false
  :setter (fn [new-value]
            (embedding/validate-provider! new-value)
            (setting/set-value-of-type! :string :ee-library-embedding-provider new-value)))

(defsetting ee-library-embedding-model
  (deferred-tru
   (str "Embedding model for the library entity index; leave empty to use ee-embedding-model. "
        "Always set ee-library-embedding-model-dimensions alongside it."))
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
