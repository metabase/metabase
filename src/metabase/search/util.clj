(ns metabase.search.util)

(defn impossible-condition?
  "An (incomplete) check where queries will definitely return nothing, to help avoid spurious index update queries."
  [where]
  (when (vector? where)
    (case (first where)
      :=   (let [[a b] (rest where)]
             (and (string? a) (string? b) (not= a b)))
      :!=  (let [[a b] (rest where)]
             (and (string? a) (string? b) (= a b)))
      :and (boolean (some impossible-condition? (rest where)))
      :or  (every? impossible-condition? (rest where))
      false)))

(defn cycle-recent-versions
  "Given a list of recently used index versions, from most recent to least recent, and an index that's just been used,
  update the list to reflect its usage, and drop stale entries."
  [previous-ids active-id]
  ;; consider the 2 most recently used indexes to be active, to handle rolling upgrades and downgrades smoothly.
  (->> (remove #{active-id} previous-ids)
       (cons active-id)
       (take 2)))
