(ns metabase-enterprise.library-branching.apply
  "The apply of a plan (`engine.plan/plan`) over the item operations of one instance."
  (:require
   [metabase-enterprise.library-branching.instance :as instance]))

(set! *warn-on-reflection* true)

(defn apply-plan
  "Carries out `plan` with the item operations `ops`. Not implemented yet."
  [_ops _plan _opts]
  (instance/not-yet! `apply-plan))
