(ns metabase.search.util
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [metabase.util :as u]
   [schema.core :as s]))

(s/defn normalize :- s/Str
  "Normalize a `query` to lower-case."
  [query :- s/Str]
  (u/lower-case-en (str/trim query)))

(s/defn tokenize :- [s/Str]
  "Break a search `query` into its constituent tokens"
  [query :- s/Str]
  (filter seq
          (str/split query #"\s+")))

(def largest-common-subseq-length
  "Given two lists (and an equality test), return the length of the longest overlapping subsequence.

  (largest-common-subseq-length = [1 2 3 :this :part :will :not :be :relevant]
                                  [:not :counted 1 2 3 :also :not :counted])
   ;; => 3"
  (memoize/fifo
   (fn
     ([eq xs ys]
      (largest-common-subseq-length eq xs ys 0))
     ([eq xs ys tally]
      (if (or (zero? (count xs))
              (zero? (count ys)))
        tally
        (max
         (if (eq (first xs)
                 (first ys))
           (largest-common-subseq-length eq (rest xs) (rest ys) (inc tally))
           tally)
         (largest-common-subseq-length eq xs (rest ys) 0)
         (largest-common-subseq-length eq (rest xs) ys 0)))))
   ;; Uses O(n*m) space (the lengths of the two lists) with k≤2, so napkin math suggests this gives us caching for at
   ;; least a 31*31 search (or 50*20, etc) which sounds like more than enough. Memory is cheap and the items are
   ;; small, so we may as well skew high.
   ;; As a precaution, the scorer that uses this limits the number of tokens (see the `take` call below)
   :fifo/threshold 2000))
