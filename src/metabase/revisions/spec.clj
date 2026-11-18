(ns metabase.revisions.spec
  "The revision spec of a model, and what it says about the model.

  A model that has a spec is revisioned: its writes make Revisions, and the Revisions revert it. A spec is a map of:

  - `:track`, the columns that a snapshot records and a revert restores, the change of one of which makes a Revision.
  - `:skip`, the columns that no snapshot records and no revert restores, so that a change of only these makes no
    Revision.

  Together they list every column of the table but `:id`, `:created_at` and `:updated_at`, which no spec lists. All
  the other keys are optional:

  - `:parent {:model parent-model :key column}`: a row of this model belongs to the Revision of the row of
    `parent-model` whose id its `column` holds, a parent that has a `:parent` of its own passing it on up. A snapshot
    of such a row keeps its `:id`.
  - `:children`, a map from a key to `{:model child-model :as hydration-key}`: the snapshot nests the snapshots of the
    child rows under the key, the child rows being those that the row hydrates under `hydration-key`.
  - `:same?`, a map from a column to a fn of the row before and the row after, true when the column is unchanged,
    `=` of the two values by default.
  - `:snapshot`, a fn of a vector of rows and the vector of their snapshots returning the snapshots to store, for what
    the columns alone do not say.
  - `:defaults`, a map from a column to the value that a snapshot recorded without it is read with, as when it was
    recorded before the column existed.
  - `:before-revert`, a fn of the id, the id of the user and a snapshot returning the snapshot to write, which checks
    and upgrades the snapshot, identity by default.
  - `:revert!`, a fn of the id, the id of the user and a snapshot that replaces the revert of the tracked columns.
  - `:describe`, a fn of the snapshots before and after and the names that [[metabase.revisions.models.revision]]
    gives returning the strings that describe the change, which replaces the description of the changed columns.
  - `:diff-columns`, the columns whose change the diff of two snapshots lists, each as `{column {:before :after}}`,
    in place of a `{:before :after}` of every changed column, the shape that the history of a Segment or a Measure
    reads.
  - `:authorize`, `:snapshot` to check each snapshot against the current user's permissions on its own, `:current`
    (the default) to let whoever reads the current row read its history."
  (:require
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

(defn parent
  "The `:parent` of `model`, nil for a model whose rows have Revisions of their own."
  [model]
  (:parent (spec model)))

(defn children
  "The `:children` of `model`, a map from a snapshot key to a child model."
  [model]
  (:children (spec model)))

(defn snapshot-keys
  "The keys of a snapshot of `model`, apart from `:id`: the tracked columns and the keys of the children."
  [model]
  (into (vec (tracked-columns model)) (keys (children model))))

(defn same?
  "Whether the `column` of `model` is the same in the row `before` and the row `after`."
  [model column before after]
  (if-let [f (get (:same? (spec model)) column)]
    (boolean (f before after))
    (= (get before column) (get after column))))
