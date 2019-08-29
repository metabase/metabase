(ns metabase.util.infer-spaces
  "Logic for automatically inferring where spaces should go in table names. Ported from
   https://stackoverflow.com/questions/8870261/how-to-split-text-without-spaces-into-list-of-words/11642687#11642687."
  ;; TODO - The code in this namespace is very hard to understand. We should clean it up and make it readable.
  (:require [clojure.java.io :as io]
            [clojure.string :as str])
  (:import java.lang.Math
           java.util.Arrays))


(def ^:const ^:private special-words ["checkins"])

(defn- slurp-words-by-frequency []
  (concat special-words (str/split-lines (slurp (io/resource "words-by-inv-frequency.txt")))))

;; wordcost = dict((k, log((i+1)*log(len(words)))) for i,k in enumerate(words))
(defn- make-cost-map
  "Creates a map keyed by the hash of the word and the cost as the value. The map is sorted by the hash value"
  [words]
  (let [log-count (Math/log (count words))]
    (into (sorted-map)
          (map-indexed (fn [idx word]
                         [(hash word) (float (Math/log (* (inc idx) log-count)))])
                       words))))

;; # Build arrays for a cost lookup, assuming Zipf's law and cost = -math.log(probability).
;;
;; This is structured as a let for efficiency reasons. It's reading in 120k strings and putting them into two
;; correlated data structures. We want to ensure that those strings are garbage collected after we setup the
;; structures and we don't want to read the file in twice
(let [all-words (slurp-words-by-frequency)
      sorted-words (make-cost-map all-words)]

  (def ^:private ^"[I" word-hashes
    "Array of word hash values, ordered by that hash value"
    (int-array (keys sorted-words)))

  (def ^:private ^"[F" word-cost
    "Array of word cost floats, ordered by the hash value for that word"
    (float-array (vals sorted-words)))

  ;; maxword = max(len(x) for x in words)
  (def ^:private max-word
    "Length of the longest word in the word list"
    (apply max (map count all-words))))

(defn- get-word-cost
  "Finds `S` in the word list. If found, returns the cost, otherwise returns `DEFAULT` like clojure.core's `get`"
  [s default]
  (let [idx (Arrays/binarySearch word-hashes (int (hash s)))]
    ;; binarySearch returns a negative number if not found
    (if (< idx 0)
      default
      (aget word-cost idx))))

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
    (apply min-key first (map-indexed (fn [k c] [(+ c (get-word-cost (subs s (- i k 1) i) 9e9999)) (inc k)]) candidates))))

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
  "Splits a string with no spaces into words using magic" ; what a great explanation. TODO - make this code readable
  [input]
  (let [s (str/lower-case input)
        cost (build-cost-array s)]
    (loop [i (float (count s))
           out []]
      (if-not (pos? i)
        (reverse out)
        (let [[c k] (best-match i s cost)]
          (recur (- i k)
                 (conj out (subs s (- i k) i))))))))
