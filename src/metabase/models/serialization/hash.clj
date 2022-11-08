(ns metabase.models.serialization.hash
  "Defines several helper functions and protocols for the serialization system.
  Serialization is an enterprise feature, but in the interest of keeping all the code for an entity in one place, these
  methods are defined here and implemented for all the exported models.

  Whether to export a new model:
  - Generally, the high-profile user facing things (databases, questions, dashboards, snippets, etc.) are exported.
  - Internal or automatic things (users, activity logs, permissions) are not.

  If the model is not exported, add it to the exclusion lists in the tests.

  For models that are exported, you have to implement this file's protocols and multimethods for it:
  - All exported models should either have an CHAR(21) column `entity_id`, or a portable external name (like a database
    URL).
  - [[identity-hash-fields]] should give the list of fields that distinguish an instance of this model from another, on
    a best-effort basis.
    - Use things like names, labels, or other stable identifying features.
    - NO numeric database IDs!
    - Any foreign keys should be hydrated and the identity-hash of the foreign entity used as part of the hash.
      - There's a [[hydrated-hash]] helper for this with several example uses."
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [toucan.hydrate :refer [hydrate]]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Identity Hashes                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; Generated entity_id values have lately been added to most exported models, but they only get populated on newly
;;; created entities. Since we can't rely on entity_id being present, we need a content-based definition of identity for
;;; all exported models.

(defmulti identity-hash-fields
  "You probably want to call [[metabase.models.serialization.hash/identity-hash]] instead of calling this directly.

  Content-based identity for the entities we export in serialization. This should return a sequence of functions to
  apply to an entity and then hash. For example, Metric's [[identity-hash-fields]] is `[:name :table]`. These
  functions are mapped over each entity and [[clojure.core/hash]] called on the result. This gives a portable hash
  value across JVMs, Clojure versions, and platforms.

  NOTE: No numeric database IDs! For any foreign key, use [[hydrated-hash]] to hydrate the foreign entity and include
  its [[identity-hash]] as part of this hash. This is a portable way of capturing the foreign relationship."
  {:arglists '([model-or-instance])}
  mi/dispatch-on-model)

(defn raw-hash
  "Hashes a Clojure value into an 8-character hex string, which is used as the identity hash.
  Don't call this outside a test, use [[identity-hash]] instead."
  [target]
  (when (sequential? target)
    (assert (seq target) "target cannot be an empty sequence"))
  (try
    (format "%08x" (hash target))
    (catch Throwable e
      (throw (ex-info (tru "Error calculating raw hash: {0}" (ex-message e))
                      {:target target}
                      e)))))

(defn identity-hash
  "Given a modeled entity, return its identity hash for use in serialization. The hash is an 8-character hex string.
  The hash is based on a set of fields on the entity, defined by its implementation of [[identity-hash-fields]].
  These hashes are intended to be a decently robust fallback for older entities whose `entity_id` fields are not
  populated."
  [entity]
  {:pre [(some? entity)]}
  (try
    (-> (for [f (identity-hash-fields entity)]
          (f entity))
        raw-hash)
    (catch Throwable e
      (throw (ex-info (tru "Error calculating identity hash: {0}" (ex-message e))
                      {:entity entity}
                      e)))))

(defn identity-hash?
  "Given a string, confirms whether it is a valid identity hash. That is, an 8-character hexadecimal number."
  [s]
  (boolean (re-matches #"^[0-9a-fA-F]{8}$" s)))

(defn hydrated-hash
  "Many entities reference other entities. Using the autoincrementing ID is not portable, so we use the identity hash
  of the referenced entity. This is a helper for writing [[identity-hash-fields]]."
  ([hydration-key] (hydrated-hash hydration-key nil))
  ([hydration-key default]
   (fn [entity]
     (let [hydrated-value (get (hydrate entity hydration-key) hydration-key)]
       (cond
         hydrated-value (identity-hash hydrated-value)
         default        default
         :else          (throw (ex-info (tru "Error calculating hydrated hash: {0} is nil after hydrating {1}"
                                             (pr-str hydration-key)
                                             (name entity))
                                        {:entity        entity
                                         :hydration-key hydration-key})))))))
