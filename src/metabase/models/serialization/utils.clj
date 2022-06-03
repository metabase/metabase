(ns metabase.models.serialization.utils
  "Defines several multimethods and helper functions for the serialization system.
  Serialization is an enterprise feature, but in the interest of keeping all the code for an entity in one place, these
  methods are defined here and implemented for all the exported models."
  (:require [potemkin.types :as p.types]
            [toucan.hydrate :refer [hydrate]]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Identity Hashes                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+
;;; Generated entity_id values have lately been added to most exported models, but they only get populated on newly
;;; created entities. Since we can't rely on entity_id being present, we need a content-based definition of identity for
;;; all exported models.
(p.types/defprotocol+ IdentityHashable
  (identity-hash-fields
    [entity]
    "You probably want to call metabase.models.serialization/identity-hash instead of calling this directly.

    Content-based identity for the entities we export in serialization. This should return a sequence of functions to
    apply to an entity and then hash. For example, Metric's identity-hash-fields is [:name :table_id]. These functions are
    mapped over each entity and clojure.core/hash called on the result. This gives a portable hash value across JVMs,
    Clojure versions, and platforms."))

(defn raw-hash
  "Hashes a Clojure value into an 8-character hex string, which is used as the identity hash.
  Don't call this outside a test, use identity-hash instead."
  [target]
  (format "%08x" (hash target)))

(defn identity-hash
  "Given a modeled entity, return its identity hash for use in serialization. The hash is an 8-character hex string.
  The hash is based on a set of fields on the entity, defined by its implementation of `identity-hash-fields`.
  These hashes are intended to be a decently robust fallback for older entities whose `entity_id` fields are not
  populated."
  [entity]
  (-> (for [f (identity-hash-fields entity)]
        (f entity))
      (#(do (prn %) %))
      raw-hash
      (#(do (prn %) %))))

(defn hydrated-hash
  "Many entities reference other entities. Using the autoincrementing ID is not portable, so we use the identity-hash
  of the referenced entity. This is a helper for writing `identity-hash-fields`."
  [hydration-key]
  (fn [entity]
    (-> entity
        (hydrate hydration-key)
        (get hydration-key)
        identity-hash)))
