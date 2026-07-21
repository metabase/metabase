(ns metabase.remote-sync.branching
  "Multimethod interface for content branching — the per-model operations that
   branching needs, implemented in each model's own namespace (the same shape as
   the serdes multimethods in [[metabase.models.serialization]]).

   A branchable model implements:

     (defmethod remote-sync.branching/clone-for-branch! :model/Card
       [_model id]
       ...create a branch-local copy of row `id`, return the new id...)

   Clones should copy the entity's *content* but not its identity, sharing, or
   stats columns (`:entity_id`, `:public_uuid`, view counts, timestamps). The
   copy lives in the same collection as its source; the branching layer keeps it
   out of the way by only surfacing it to users who have the branch checked out.

   Deletion needs no per-model method — branch copies are deleted with a plain
   `t2/delete!` on the model."
  (:require
   [metabase.api.common :as api]
   [toucan2.core :as t2]))

(def keep-me
  "Marker so the core facade can retain its require of this namespace."
  nil)

(defmulti clone-for-branch!
  "Create a branch-local copy of the `model` row with `id` and return the copy's
   id. Implemented per model in the model's namespace; see the namespace
   docstring for the contract."
  {:arglists '([model id])}
  (fn [model _id] model))

(defn clone-row!
  "Helper for simple `clone-for-branch!` implementations: copy the row's
   `keep-keys`, stamp the current user as creator, insert, return the new id."
  [model id keep-keys]
  (let [source (t2/select-one model :id id)]
    (t2/insert-returning-pk! model
                             (-> (select-keys source keep-keys)
                                 (assoc :creator_id api/*current-user-id*)))))
