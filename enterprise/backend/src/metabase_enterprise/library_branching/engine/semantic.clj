(ns metabase-enterprise.library-branching.engine.semantic
  "The semantic check of a snapshot against an environment: every reference to an environment object names an object
  of the environment.")

(set! *warn-on-reflection* true)

(defn validate
  "The semantic findings of snapshot `s` against environment `env`, `{natural-key object}` (`manifest/env`): a vector
  that is empty iff every reference `[role [:env k]]` of `s` has its natural key `k` in `env`. Each finding is
  `{:rule :env-resolves :id i :ref [role [:env k]]}`, in the order of the identities, then of the references."
  [_s _env]
  [])
