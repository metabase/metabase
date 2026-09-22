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
   [metabase.util.malli.registry :as mr]
   [metabase.worktree.core :as worktree]
   [toucan2.model :as t2.model]))

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

(def ^:private remapping-batch-size
  "Maximum number of ids per `:in` clause when reading remappings, to stay under database parameter limits."
  1000)

(defn worktree-scoped?
  "Whether `model` -- a serdes model-name string, or a model keyword/symbol -- is scoped by the current worktree:
  one that derives `:hook/worktree-id`, i.e. whose table carries the column. Extraction for these is filtered by
  the worktree the caller is in, loads stamp it, and their `entity_id`s are translated through
  `worktree_entity_remapping`, so a worktree holds its own copy of an entity the main app already has.

  Tables and Fields do not: they are shared warehouse metadata, the same row for the main app and every worktree.
  What a branch sets on one is not shared, though -- that lives in the `*UserSettings` overlay, which does carry
  a row per worktree."
  [model]
  (isa? (t2.model/resolve-model (if (keyword? model) model (symbol (name model))))
        :hook/worktree-id))

(defn source-entity-id
  "The `entity_id` `entity-id` is serialized under -- the one the branch knows the entity by. Inside a worktree that
  is read from the remapping table; a row with no remapping is main-app content the worktree merely refers to, and
  keeps its own id."
  [model-name entity-id]
  (or (when (and (worktree/worktree-id) entity-id)
        (models.db/worktree-entity-remapping-source-entity-id (worktree/worktree-id) (name model-name) entity-id))
      entity-id))

(defn local-entity-id
  "The `entity_id` of the local row standing for the serialized `entity-id`. Inside a worktree that is the copy the
  worktree checked out, so a load never matches -- or overwrites -- the main app's row for the same entity; `nil`
  when this worktree has not checked the entity out yet, which is what makes a load insert a fresh copy."
  [model-name entity-id]
  (if-let [worktree-id (worktree/worktree-id)]
    (when entity-id
      (models.db/worktree-entity-remapping-local-entity-id worktree-id (name model-name) entity-id))
    entity-id))

(defn local-entity-ids
  "Batch [[local-entity-id]] over `entity-ids`, returned as a set. Ids this worktree has no remapping for pass
  through unchanged -- they name content the worktree has not checked out, so they cannot match any local row.
  Returns the ids untouched outside a worktree."
  [model-name entity-ids]
  (if (and (worktree/worktree-id) (seq entity-ids))
    (let [source->local (into {}
                              (mapcat (fn [chunk]
                                        (models.db/worktree-entity-remapping-source->local (worktree/worktree-id) (name model-name) chunk)))
                              (partition-all remapping-batch-size entity-ids))]
      (into #{} (map #(source->local % %)) entity-ids))
    (set entity-ids)))

(defn ensure-remapping!
  "Records that this worktree's copy of a `model-name` entity is `local-entity-id`, known to the branch as `source`,
  and returns `source`. When `source` is nil -- content created inside the worktree, which the branch has never
  seen -- a fresh id is minted for it, so what the worktree pushes can never collide with the row the main app
  holds. A no-op outside a worktree, when the pair is already recorded, and when handed an id that is already a
  source id for this worktree, so calling it twice on the way out never mints a second id.

  A `source` this worktree already has a remapping for is re-pointed at `local-entity-id` rather than recorded
  twice: the row it named is gone (deleted on the branch, then restored; or deleted locally before a pull), and
  the branch id may only ever name one local row."
  ([model-name local-entity-id]
   (ensure-remapping! model-name local-entity-id nil))
  ([model-name local-entity-id source]
   (if-not (and (worktree/worktree-id) local-entity-id)
     (or source local-entity-id)
     (let [worktree-id (worktree/worktree-id)
           model-name  (name model-name)]
       (or (models.db/worktree-entity-remapping-source-entity-id worktree-id model-name local-entity-id)
           (when (models.db/worktree-entity-remapping-source-exists? worktree-id model-name local-entity-id)
             local-entity-id)
           (when (and source
                      (pos? (models.db/update-worktree-entity-remapping-local-entity-id!
                             worktree-id model-name source local-entity-id)))
             source)
           (let [source (or source (u/generate-nano-id))]
             (models.db/insert-worktree-entity-remapping! worktree-id model-name source local-entity-id)
             source))))))

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
  "Returns `{:model \"ModelName\" :id \"id-string\"}`.

  Inside a worktree the id is the entity's *source* id -- what the branch calls it -- so what gets written, and
  every reference to it, matches the rest of the branch rather than naming the worktree's private copy. The
  mapping is recorded if it does not exist yet: a reference can be serialized before the entity it points at, and
  both have to name it the same way.

  Only the worktree's own rows are remapped. A worktree's content may point at main-app rows it merely
  references -- a source card, a snippet -- and those keep the id everyone already knows them by."
  [model-name entity]
  (let [eid (entity-id model-name entity)]
    {:model model-name
     :id    (if (and (worktree-scoped? model-name)
                     (= (:worktree_id entity) (worktree/worktree-id)))
              (ensure-remapping! model-name eid)
              eid)}))

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
  turn a foreign key from a portable form to an appdb ID. Returns a Toucan entity or nil.

  Inside a worktree the id is resolved through the remapping table first, so a load finds the worktree's own copy
  and never the main app's row for the same entity."
  [model :- ::model-keyword-or-symbol id-str :- :string]
  (when-let [id-str (if (worktree-scoped? model) (local-entity-id model id-str) id-str)]
    (models.db/entity-by-entity-id model id-str)))

(defn field-hierarchy
  "Returns the field hierarchy (field + parents) for a field ID. Used by resolvers."
  [id]
  (reverse
   (models.db/field-hierarchy-rows id)))
