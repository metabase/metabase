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

(def ^:private remapping-batch-size
  "Maximum number of ids per `:in` clause when reading remappings, to stay under database parameter limits."
  1000)

(def ^:dynamic *worktree-id*
  "The remote-sync worktree an import or export is operating on; `nil` is the main app. Bound for the duration of a
  single pull/push (which is always about exactly one worktree) by the remote-sync code that drives it, and left
  `nil` by the plain serdes API, which only ever sees main-app content. A pull is the only thing that puts content
  into a worktree -- no API creates it -- so this is the only place `worktree_id` is ever written. Extraction is
  scoped by it, and entity ids are translated through the worktree's remapping table on the way out and back in."
  nil)

(def worktree-scoped-models
  "Serdes model names whose table carries a `worktree_id` column. Extraction for these is scoped by
  [[*worktree-id*]], loads stamp it, and their `entity_id`s are translated through `worktree_remapping` -- so a
  worktree holds its own copy of an entity the main app already has, under an id of its own.

  Tables and Fields are absent: they are shared warehouse metadata, the same row for the main app and every
  worktree."
  #{"Card" "Collection" "Dashboard" "DashboardCard" "DashboardCardSeries" "DashboardTab" "Dimension" "Document"
    "Glossary" "Measure" "NativeQuerySnippet" "ParameterCard" "PythonLibrary" "Segment" "TableIndex" "Timeline"
    "TimelineEvent" "Transform" "TransformTag" "TransformTest" "TransformTransformTag"})

(defn worktree-scoped?
  "Whether `model` -- a serdes model-name string, or a model keyword/symbol -- is scoped by the current worktree."
  [model]
  (contains? worktree-scoped-models (if (string? model) model (name model))))

(defn worktree-scope
  "The worktree scope of a worktree-scoped `model`'s extraction, `{:worktree-id id}` naming [[*worktree-id*]] (nil
  for the main app); `nil` for models that aren't worktree-scoped, whose tables have no column to restrict. Every
  extraction query for a scoped model needs it, so an export only ever contains one worktree's content -- the main
  app's, for the plain serdes API."
  [model]
  (when (worktree-scoped? model)
    {:worktree-id *worktree-id*}))

(defn source-entity-id
  "The `entity_id` `entity-id` is serialized under -- the one the branch knows the entity by. Inside a worktree that
  is read from the remapping table; a row with no remapping is main-app content the worktree merely refers to, and
  keeps its own id."
  [model-name entity-id]
  (or (when (and *worktree-id* entity-id)
        (models.db/worktree-remapping-source-entity-id *worktree-id* (name model-name) entity-id))
      entity-id))

(defn local-entity-id
  "The `entity_id` of the local row standing for the serialized `entity-id`. Inside a worktree that is the copy the
  worktree checked out, so a load never matches -- or overwrites -- the main app's row for the same entity; `nil`
  when this worktree has not checked the entity out yet, which is what makes a load insert a fresh copy."
  [model-name entity-id]
  (if *worktree-id*
    (when entity-id
      (models.db/worktree-remapping-local-entity-id *worktree-id* (name model-name) entity-id))
    entity-id))

(defn local-entity-ids
  "Batch [[local-entity-id]] over `entity-ids`, returned as a set. Ids this worktree has no remapping for pass
  through unchanged -- they name content the worktree has not checked out, so they cannot match any local row.
  Returns the ids untouched outside a worktree."
  [model-name entity-ids]
  (if (and *worktree-id* (seq entity-ids))
    (let [source->local (into {}
                              (mapcat (fn [chunk]
                                        (models.db/worktree-remapping-source->local *worktree-id* (name model-name) chunk)))
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
   (if-not (and *worktree-id* local-entity-id)
     (or source local-entity-id)
     (let [worktree-id *worktree-id*
           model-name  (name model-name)]
       (or (models.db/worktree-remapping-source-entity-id worktree-id model-name local-entity-id)
           (when (models.db/worktree-remapping-source-exists? worktree-id model-name local-entity-id)
             local-entity-id)
           (when (and source
                      (pos? (models.db/update-worktree-remapping-local-entity-id!
                             worktree-id model-name source local-entity-id)))
             source)
           (let [source (or source (u/generate-nano-id))]
             (models.db/insert-worktree-remapping! worktree-id model-name source local-entity-id)
             source))))))

(defn current-worktree-id
  "The remote-sync worktree the current import or export is operating on, or nil for the main app."
  []
  *worktree-id*)

(defn do-with-worktree
  "Run `thunk` with [[*worktree-id*]] bound to `worktree-id`. Impl for the remote-sync code that drives a pull or a
  push; everything serdes does inside is scoped to that worktree."
  [worktree-id thunk]
  (binding [*worktree-id* worktree-id]
    (thunk)))

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
                     (= (:worktree_id entity) *worktree-id*))
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
