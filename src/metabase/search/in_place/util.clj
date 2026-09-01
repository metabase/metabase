(ns metabase.search.in-place.util
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(defn wildcard-match
  "Returns a string pattern to match a wildcard search term."
  [s]
  (str "%" s "%"))

(mu/defn normalize :- :string
  "Normalize a `query` to lower-case."
  [query :- :string]
  (u/lower-case-en (str/trim query)))

(mu/defn tokenize :- [:sequential :string]
  "Break a search `query` into its constituent tokens"
  [query :- :string]
  (filter seq
          (str/split query #"\s+")))

(defn largest-common-subseq-length
  "Given two lists (and an equality test), return the length of the longest overlapping subsequence.

  (largest-common-subseq-length = [1 2 3 :this :part :will :not :be :relevant]
                                  [:not :counted 1 2 3 :also :not :counted])
   ;; => 3

  Iterative O(n*m) DP: each row holds the length of the common run ending at the current `x` and each `y`."
  [eq xs ys]
  (let [next-row (fn [prev-row x]
                   (into [0] (map-indexed (fn [j y] (if (eq x y) (inc (nth prev-row j 0)) 0))) ys))
        rows     (reductions next-row [] xs)]
    (transduce cat max 0 rows)))
