(ns metabase.util.infer-spaces
  "Logic for automatically inferring where spaces should go in table names. Ported from ported from https://stackoverflow.com/questions/8870261/how-to-split-text-without-spaces-into-list-of-words/11642687#11642687."
  (:require [clojure.java.io :as io]
            [clojure.string :as s])
  (:import java.lang.Math))


(def ^:const ^:private special-words ["checkins"])

;; # Build a cost dictionary, assuming Zipf's law and cost = -math.log(probability).
(def ^:private words (concat special-words (s/split-lines (slurp (io/resource "words-by-frequency.txt")))))

;; wordcost = dict((k, log((i+1)*log(len(words)))) for i,k in enumerate(words))
(def ^:private word-cost
  (into {} (map-indexed (fn [idx word]
                          [word (Math/log (* (inc idx) (Math/log (count words))))])
                        words)))

;; maxword = max(len(x) for x in words)
(def ^:private max-word (apply max (map count words)))

;; def infer_spaces(s):
;;     """Uses dynamic programming to infer the location of spaces in a string
;;     without spaces."""
;
;;     # Find the best match for the i first characters, assuming cost has
;;     # been built for the i-1 first characters.
;;     # Returns a pair (match_cost, match_length).
;;     def best_match(i):
;;         candidates = enumerate(reversed(cost[max(0, i-maxword):i]))
;;         return min((c + wordcost.get(s[i-k-1:i], 9e999), k+1) for k,c in candidates)
(defn- best-match
  [i s cost]
  (let [candidates (reverse (subvec cost (max 0 (- i max-word)) i))]
    (apply min-key first (map-indexed (fn [k c] [(+ c (get word-cost (subs s (- i k 1) i) 9e9999)) (inc k)]) candidates))))

;;     # Build the cost array.
;;     cost = [0]
;;     for i in range(1,len(s)+1):
;;         c,k = best_match(i)
;;         cost.append(c)
(defn- build-cost-array
  [s]
  (loop [i 1
         cost [0]]
    (if-not (< i (inc (count s)))
      cost
      (recur (inc i)
             (conj cost (first (best-match i s cost)))))))

;;     # Backtrack to recover the minimal-cost string.
;;     out = []
;;     i = len(s)
;;     while i>0:
;;         c,k = best_match(i)
;;         assert c == cost[i]
;;         out.append(s[i-k:i])
;;         i -= k
;;
;;     return " ".join(reversed(out))
(defn infer-spaces
  "Splits a string with no spaces into words using magic"
  [input]
  (let [s (s/lower-case input)
        cost (build-cost-array s)]
    (loop [i (count s)
           out []]
      (if-not (pos? i)
        (reverse out)
        (let [[c k] (best-match i s cost)]
          (recur (- i k)
                 (conj out (subs s (- i k) i))))))))
