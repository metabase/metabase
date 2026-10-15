(ns metabase-enterprise.library-branching.format.json
  "A reader of JSON text, for the JSON text that visualization settings hold inside strings and map keys.")

(set! *warn-on-reflection* true)

;; Babashka has no JSON reader that the checker can load (clojure.data.json does not load, and the codebase lints
;; cheshire), and the YAML reader refuses the JSON escape `\/`. So this namespace reads JSON itself.

(defn- fail
  [^String s i]
  (throw (ex-info (str "Not JSON text, at position " i ": " (pr-str s)) {:type ::invalid :text s :position i})))

(defn- char-at
  "The character of `s` at `i`, or nil past its end."
  [^String s i]
  (when (< i (.length s)) (.charAt s i)))

(defn- skip-space
  [^String s i]
  (if (contains? #{\space \tab \newline \return} (char-at s i))
    (recur s (inc i))
    i))

(def ^:private escapes
  {\" \", \\ \\, \/ \/, \b \backspace, \f \formfeed, \n \newline, \r \return, \t \tab})

(defn- read-string*
  "`[string end]` of the string whose opening quote is at `i`."
  [^String s i]
  (let [sb (StringBuilder.)]
    (loop [i (inc i)]
      (let [c (char-at s i)]
        (cond
          (nil? c)       (fail s i)
          (= \" c)       [(str sb) (inc i)]
          (= \\ c)       (let [e (char-at s (inc i))]
                           (cond
                             (contains? escapes e)
                             (do (.append sb (char (get escapes e))) (recur (+ i 2)))

                             (and (= \u e) (re-matches #"[0-9A-Fa-f]{4}" (subs s (min (+ i 2) (.length s))
                                                                               (min (+ i 6) (.length s)))))
                             (do (.append sb (char (Integer/parseInt (subs s (+ i 2) (+ i 6)) 16)))
                                 (recur (+ i 6)))

                             :else (fail s i)))
          (< (int c) 0x20) (fail s i)
          :else          (do (.append sb (char c)) (recur (inc i))))))))

(def ^:private number-chars
  #{\- \+ \. \e \E \0 \1 \2 \3 \4 \5 \6 \7 \8 \9})

(defn- read-number
  "`[number end]` of the number that starts at `i`."
  [^String s i]
  (let [end  (loop [j i] (if (contains? number-chars (char-at s j)) (recur (inc j)) j))
        text (subs s i end)]
    (cond
      (re-matches #"-?(0|[1-9][0-9]*)" text)
      [(or (parse-long text) (bigint text)) end]

      (re-matches #"-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?" text)
      [(parse-double text) end]

      :else (fail s i))))

(declare ^:private read-value)

(defn- read-elements
  "`[elements end]` of the array or object whose opening bracket is at `i`. `read-element` reads one element at its
  start position and gives `[element end]`."
  [^String s i close read-element]
  (let [i (skip-space s (inc i))]
    (if (= close (char-at s i))
      [[] (inc i)]
      (loop [acc [], i i]
        (let [[x i] (read-element s i)
              acc   (conj acc x)
              i     (skip-space s i)
              c     (char-at s i)]
          (cond
            (= \, c)     (recur acc (skip-space s (inc i)))
            (= close c)  [acc (inc i)]
            :else        (fail s i)))))))

(defn- read-entry
  "`[[key value] end]` of the object entry at `i`; the key is a keyword."
  [^String s i]
  (when-not (= \" (char-at s i)) (fail s i))
  (let [[k i] (read-string* s i)
        i     (skip-space s i)]
    (when-not (= \: (char-at s i)) (fail s i))
    (let [[v i] (read-value s (skip-space s (inc i)))]
      [[(keyword k) v] i])))

(defn- read-literal
  [^String s i word value]
  (if (.startsWith s ^String word (int i))
    [value (+ i (count word))]
    (fail s i)))

(defn- read-value
  "`[value end]` of the JSON value that starts at `i`."
  [^String s i]
  (let [c (char-at s i)]
    (cond
      (= \" c) (read-string* s i)
      (= \[ c) (read-elements s i \] read-value)
      (= \{ c) (let [[entries end] (read-elements s i \} read-entry)] [(into {} entries) end])
      (= \t c) (read-literal s i "true" true)
      (= \f c) (read-literal s i "false" false)
      (= \n c) (read-literal s i "null" nil)
      (contains? number-chars c) (read-number s i)
      :else    (fail s i))))

(defn parse
  "The value of the JSON text `s`: vectors, maps with keyword keys, strings, longs (a bigint past the long range),
  doubles, booleans and nil. Throws an ex-info of type ::invalid when `s` is not exactly one JSON value, with
  white space around it allowed. Of two entries with one key, the second one stays."
  [^String s]
  (let [[v i] (read-value s (skip-space s 0))]
    (if (= (skip-space s i) (.length s))
      v
      (fail s i))))
