(ns metabase-enterprise.library-branching.collation
  "String equality under utf8mb4_unicode_ci, the collation of every table of a MySQL or MariaDB app DB, as a pure
  function of the strings."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def table-resource
  "The resource that holds the primary weights of every BMP code point under utf8mb4_unicode_ci (UCA 4.0.0). Each
  line that is not blank and does not start with `#` is `CODE W1 ... Wk`, `CODE*N W1 ... Wk` or `CODE+N W1 ... Wk`, in
  hex: code point CODE has the weights W1 to Wk; `*N`: so do the N - 1 code points after it; `+N`: the N - 1 code
  points after it have them too, but with Wk greater by one for each code point. A code point with no weight is
  ignorable."
  "metabase_enterprise/library_branching/utf8mb4_unicode_ci.txt")

(def ^:private space-weight
  "The weight of U+0020. The collation pads the shorter of two strings with spaces (PAD SPACE)."
  0x0209)

(def ^:private supplementary-weight
  "The weight that the collation gives to every code point above U+FFFF."
  0xFFFD)

(defn- weights-string
  ^String [weights]
  (str/join (map char weights)))

(defn- read-table
  "An array of 65,536 elements: the weights of each BMP code point as a string (one char per weight), from the lines of
  [[table-resource]]; nil for a code point with no line."
  [lines]
  (let [table (object-array 0x10000)]
    (doseq [^String line lines
            :let [line (str/trim line)]
            :when (not (or (str/blank? line) (str/starts-with? line "#")))]
      (let [[spec & weights] (str/split line #"\s+")
            [_ code op n]    (or (re-matches #"([0-9A-F]{4})(?:([*+])([0-9]+))?" spec)
                                 (throw (ex-info (str "Bad line in " table-resource ": " line) {:line line})))
            code             (Integer/parseInt code 16)
            weights          (mapv #(Integer/parseInt % 16) weights)]
        (dotimes [k (if n (Integer/parseInt n) 1)]
          (aset table (+ code k) (weights-string (if (and (= "+" op) (pos? k))
                                                   (conj (pop weights) (+ (peek weights) k))
                                                   weights))))))
    table))

(def ^:private table
  (delay (with-open [r (io/reader (or (io/resource table-resource)
                                      (throw (ex-info (str "No resource " table-resource) {}))))]
           (read-table (line-seq r)))))

(defn- code-point-weights
  ^String [^objects table cp]
  (if (< 0xFFFF (long cp))
    (str (char supplementary-weight))
    ;; Only a lone surrogate has no line; it is not valid utf8mb4, so any weights that no other code point has do.
    (or (aget table cp) (weights-string [0xFFFE cp]))))

(defn primary-key
  "The primary weights of string `s` under utf8mb4_unicode_ci, one char per weight, with trailing space weights
  removed. Two strings are equal under utf8mb4_unicode_ci iff their keys are equal."
  ^String [^String s]
  (let [table @table
        sb    (StringBuilder.)
        n     (.length s)]
    (loop [i 0]
      (when (< i n)
        (let [cp (.codePointAt s i)]
          (.append sb (code-point-weights table cp))
          (recur (+ i (Character/charCount cp))))))
    (loop [end (.length sb)]
      (if (and (pos? end) (= space-weight (int (.charAt sb (dec end)))))
        (recur (dec end))
        (.substring sb 0 end)))))
