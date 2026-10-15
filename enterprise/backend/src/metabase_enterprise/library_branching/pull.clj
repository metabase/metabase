(ns metabase-enterprise.library-branching.pull
  "The pull: the head of the branch into the instance. Not implemented yet.")

(set! *warn-on-reflection* true)

(defn- not-yet!
  [f]
  (throw (ex-info (str f " is not implemented yet.") {:fn f})))

(defn decide
  "`decisions` with a keep-mine decision. Not implemented yet."
  [_decisions _id _content _head]
  (not-yet! `decide))

(defn decisions-for
  "The keep-mine decisions that hold. Not implemented yet."
  [_decisions _head _local]
  (not-yet! `decisions-for))

(defn pull!
  "Pulls the head of `branch` into `inst`. Not implemented yet."
  ([inst store branch]
   (pull! inst store branch {}))
  ([_inst _store _branch _opts]
   (not-yet! `pull!)))
