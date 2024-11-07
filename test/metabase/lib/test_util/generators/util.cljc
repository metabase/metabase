(ns metabase.lib.test-util.generators.util)

(defn choose
  "Uniformly chooses among a seq of options.

  Returns nil if the list is empty! This is handy for choose-and-do vs. do-nothing while writing the next steps."
  [xs]
  (when-not (empty? xs)
    (rand-nth xs)))
