(ns metabase-enterprise.library-branching.mutation.demo
  "A tiny pure function that the mutation harness demo mutates.")

(defn plan-writes
  "The sorted set of item ids that a pull may write: each id whose content `theirs` changed from `base`, and whose
  content `mine` still holds at its `base` value. Each argument is a map `{id content}`; a missing id is absent
  content."
  [base mine theirs]
  (into (sorted-set)
        (filter (fn [id]
                  (and (not= (get base id) (get theirs id))
                       (= (get base id) (get mine id)))))
        (concat (keys base) (keys theirs))))
