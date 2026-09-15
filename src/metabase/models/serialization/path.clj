(ns metabase.models.serialization.path
  "Portable identity for serdes entities: entity IDs, the `:serdes/meta` path built from them, and the appdb lookups
  that go the other way.

  Lives below [[metabase.models.serialization]] so that resolver implementations can use it without depending on the
  serdes interface, which depends on them in turn."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.models.db :as models.db]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::model-keyword
  [:and
   qualified-keyword?
   [:fn
    {:error/message ":model/X keyword"}
    #(when (qualified-keyword? %)
       (= (namespace %) "model"))]])

(mr/def ::model-keyword-or-symbol
  [:or symbol? ::model-keyword])

(defmulti entity-id
  "Given the model name and an entity, returns its entity ID (which might be nil).

  This abstracts over the exact definition of the \"entity ID\" for a given entity.
  By default this is a column, `:entity_id`.

  Models that have a different portable ID (`Database`, `Field`, etc.) should override this."
  {:arglists '([model-name instance])}
  (fn [model-name _instance] model-name))

(defmethod entity-id :default [_ instance]
  (some-> instance :entity_id str/trim))

(defmulti generate-path
  "Given the model name and raw entity from the database, returns a vector giving its *path*.
  `(generate-path \"ModelName\" entity)`

  The path is a vector of maps, root first and this entity itself last. Each map looks like:
  `{:model \"ModelName\" :id \"entity ID, identity hash, or custom ID\" :label \"optional human label\"}`

  Nested models with no entity_id need to return nil for generate-path."
  {:arglists '([model-name instance])}
  (fn [model-name _instance] model-name))

(defn infer-self-path
  "Returns `{:model \"ModelName\" :id \"id-string\"}`"
  [model-name entity]
  {:model model-name
   :id    (entity-id model-name entity)})

(defn maybe-labeled
  "Common helper for defining [[generate-path]] for an entity that is
  (1) top-level, ie. a one layer path;
  (2) labeled by a single field, slugified.

  For example, a Card's or Dashboard's `:name` field."
  [model-name entity slug-key]
  (let [self  (infer-self-path model-name entity)
        label (slug-key entity)]
    [(-> self
         (m/assoc-some :label (some-> label (u/slugify {:unicode? true}))))]))

(defmethod generate-path :default [model-name entity]
  ;; This default works for most models, but needs overriding for those that don't rely on entity_id.
  (maybe-labeled model-name entity #(if (string? (:name %))
                                      (:name %)
                                      (:format-string (:name %)))))

(mu/defn lookup-by-id
  "Given an entity ID string, finds the matching entity. This is useful when writing [[metabase.models.serialization/xform-one]] to
  turn a foreign key from a portable form to an appdb ID. Returns a Toucan entity or nil."
  [model :- ::model-keyword-or-symbol id-str]
  (models.db/entity-by-entity-id model id-str))

(defn field-hierarchy
  "Returns the field hierarchy (field + parents) for a field ID. Used by resolvers."
  [id]
  (reverse
   (models.db/field-hierarchy-rows id)))
