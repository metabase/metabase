(ns metabase-enterprise.library-branching.engine.semantic
  "The semantic check of a snapshot against an environment: every reference to an environment object names an object
  of the environment."
  (:require
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(defn- env-target?
  [target]
  (and (vector? target) (= :env (first target))))

(defn validate
  "The semantic findings of snapshot `s` against environment `env`, `{natural-key object}` (`manifest/env`): a vector
  that is empty iff every reference `[role [:env k]]` of `s` has its natural key `k` in `env`. Each finding is
  `{:rule :env-resolves :id i :ref [role [:env k]]}`, in the order of the identities, then of the references."
  [s env]
  (vec (for [[id {:keys [refs]}] (sort-by key snapshot/compare-identities s)
             [_ target :as ref]  (sort-by str refs)
             :when               (env-target? target)
             :let                [k (second target)]
             :when               (not (contains? env k))]
         {:rule :env-resolves :id id :ref ref})))
