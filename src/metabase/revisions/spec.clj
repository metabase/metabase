(ns metabase.revisions.spec
  "The revision spec of a model, and what it says about the model.

  A model that has a spec is revisioned: its writes make Revisions, and the Revisions revert it. A spec is a map of:

  - `:track`, the columns that a snapshot records and a revert restores, the change of one of which makes a Revision.
  - `:skip`, the columns that no snapshot records and no revert restores, so that a change of only these makes no
    Revision.
  - `:schema`, the schema of a snapshot as a Revision stores it, named `::<model>.revision` in the schema namespace
    of the module of the model, which may differ from the schema of the model: a snapshot holds the tracked columns
    and, for a parent, its parts, each under the key that its schema nests the schema of the part. A snapshot that is
    taken is a value of it. A revert decodes the snapshot that a Revision stores with it and refuses one that is
    invalid after that, so that its decoding is where the older formats of a snapshot are handled: a closed map
    schema drops the keys it does not list, and its `:decode/normalize` properties rename, default and convert the
    rest.

  `:track` and `:skip` together list every column of the table but `:id`, `:created_at` and `:updated_at`, which no
  spec lists. All the other keys are optional:

  - `:same?`, a map from a column to a fn of the row before and the row after, true when the column is unchanged,
    `=` of the two values by default.
  - `:snapshot`, a fn of a vector of rows and the vector of their snapshots returning the snapshots to store, for what
    the columns alone do not say, such as the parts of a parent.
  - `:defaults`, a map from a column to the value that a snapshot recorded without it is read with, as when it was
    recorded before the column existed.
  - `:before-revert`, a fn of the id, the id of the user and the decoded snapshot returning the snapshot to write,
    which checks it against what is not its shape, identity by default.
  - `:revert!`, a fn of the id, the id of the user and the decoded snapshot that reverts the row through the write
    function of its model, which every revisioned entity has.
  - `:describe`, a fn of the snapshots before and after and the names that [[metabase.revisions.models.revision]]
    gives returning the strings that describe the change, which replaces the description of the changed columns.
  - `:diff-columns`, the columns whose change the diff of two snapshots lists, each as `{column {:before :after}}`,
    in place of a `{:before :after}` of every changed column, the shape that the history of a Segment or a Measure
    reads.
  - `:authorize`, `:snapshot` to check each snapshot against the current user's permissions on its own, `:current`
    (the default) to let whoever reads the current row read its history."
  (:require
   [malli.core :as mc]
   [metabase.util.malli.registry :as mr]
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(defmulti spec
  "The revision spec of `model`, or nil when the model has no Revisions."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil))
    (when-not (= (get-method spec model) (get-method spec :default))
      (spec model))))

(def implicit-columns
  "The columns that no spec lists: the key, which never changes, and the timestamps that every write sets."
  #{:id :created_at :updated_at})

(defn revisioned?
  "Whether `model` has Revisions."
  [model]
  (some? (spec model)))

(defn revisioned-models
  "The revisioned models that have loaded."
  []
  (disj (set (keys (methods spec))) :default))

(defn tracked-columns
  "The `:track` columns of `model`."
  [model]
  (:track (spec model)))

(defn schema
  "The `:schema` of `model`, the schema of its snapshots, nil for a model without Revisions."
  [model]
  (:schema (spec model)))

(defn schema-keys
  "The keys of the map schema registered as `schema-key`."
  [schema-key]
  (mapv first (mc/entries (mc/deref-all (mr/schema schema-key)))))

(defn snapshot-keys
  "The keys of a snapshot of `model`, apart from `:id`: those of its `:schema`."
  [model]
  (into [] (remove #{:id}) (schema-keys (schema model))))

(defn same?
  "Whether the `column` of `model` is the same in the row `before` and the row `after`."
  [model column before after]
  (if-let [f (get (:same? (spec model)) column)]
    (boolean (f before after))
    (= (get before column) (get after column))))
