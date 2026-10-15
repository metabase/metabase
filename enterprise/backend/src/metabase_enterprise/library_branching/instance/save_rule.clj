(ns metabase-enterprise.library-branching.instance.save-rule
  "The save rule of the instance: a save may not make an in-scope item refer to an item that is not in scope, one
  outside the Library tree or in the trash.")

(set! *warn-on-reflection* true)

(defn findings
  "The references of the items of snapshot `s` to items whose identity is not in `in-scope`. Not implemented yet."
  [_s _in-scope]
  #{})

(defn do-with-save-rule
  "Calls `f` with no arguments and returns its result. Not implemented yet: no save is refused."
  [f]
  (f))
