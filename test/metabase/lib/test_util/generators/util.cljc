(ns metabase.lib.test-util.generators.util)

(defn choose
  "Uniformly chooses among a seq of options.

  Returns nil if the list is empty! This is handy for choose-and-do vs. do-nothing while writing the next steps."
  [xs]
  (when-not (empty? xs)
    (rand-nth xs)))

(defn weighted-choice
  "Given a map of `{x weight}`, randomly choose among the choices, based on their weights.

  The weights are unitless positive integers.

  Returns the selected `x`."
  [choices]
  (let [;; Returns a pair of the total weight, and a list of [max-roll choice] pairs, in ascending order of max-roll.
        [total ascending]    (reduce (fn [[cumulative pairs] [choice weight]]
                                       (let [new-cum (+ cumulative weight)]
                                         [new-cum (conj pairs [new-cum choice])]))
                                     [0 []]
                                     choices)
        roll                 (rand-int total)
        [[_weight selected]] (drop-while (fn [[max-roll _choice]]
                                           (<= max-roll roll))
                                         ascending)]
    selected))

(comment
  ;; Human testing that [[weighted-choice]] is sampling properly.
  ;; Should be something like {:a 100000, :b 10000, :c 1000}.
  (->> (for [_ (range 111000)]
         (weighted-choice {:a 100
                           :b 10
                           :c 1}))
       frequencies))
