(ns mage.readable.doc
  "A tiny Wadler/prettier-style layout engine. Translation rules build *docs* instead of strings so that line
  breaking and indentation are decided in one place, deterministically.

  A doc is one of:

    \"text\"                  literal text
    nil                     nothing
    [doc ...]               concatenation (any vector whose first element is not a doc keyword)
    [:nest n doc]           indent line breaks inside `doc` by n more spaces
    [:group doc]            lay `doc` out on one line if it fits, otherwise break its lines
    [:if-break broken flat] choose by the enclosing group's mode
    :line                   a space when flat, a newline when broken
    :softline               nothing when flat, a newline when broken
    :hardline               always a newline (and forces enclosing groups to break)"
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def width
  "Target line width for rendered output."
  100)

(def ^:private directives #{:nest :group :if-break})

(defn- directive [d]
  (when (and (vector? d) (directives (first d)))
    (first d)))

(defn- push-all
  "Push the docs `ds` (in order) onto the front of the command list `stack`, all with the same indent and mode."
  [stack indent mode ds]
  (reduce (fn [acc d] (conj acc [indent mode d])) stack (reverse ds)))

(defn- fits?
  "Does the rest of the current line fit in `remaining` columns? `stack` is a list of [indent mode doc]."
  [remaining stack]
  (loop [w remaining, stack stack]
    (cond
      (neg? w)     false
      (empty? stack) true
      :else
      (let [[i m d] (first stack)
            more    (pop stack)]
        (cond
          (nil? d)          (recur w more)
          (string? d)       (recur (- w (count d)) more)
          (= d :line)       (if (= m :flat) (recur (dec w) more) true)
          (= d :softline)   (if (= m :flat) (recur w more) true)
          (= d :hardline)   (= m :break)
          :else
          (case (directive d)
            :nest     (recur w (conj more [(+ i (second d)) m (nth d 2)]))
            :group    (recur w (conj more [i m (second d)]))
            :if-break (recur w (conj more [i m (if (= m :break) (nth d 1) (nth d 2))]))
            (recur w (push-all more i m d))))))))

(defn- newline! [^StringBuilder sb indent]
  (.append sb "\n")
  (dotimes [_ indent] (.append sb " "))
  indent)

(defn render
  "Render `doc` to a string, trimming trailing whitespace from every line."
  ([doc] (render doc width))
  ([doc width]
   (let [sb (StringBuilder.)]
     (loop [col 0, stack (list [0 :break doc])]
       (when (seq stack)
         (let [[i m d] (first stack)
               more    (pop stack)]
           (cond
             (nil? d)        (recur col more)
             (string? d)     (do (.append sb ^String d) (recur (+ col (count d)) more))
             (= d :line)     (if (= m :flat)
                               (do (.append sb " ") (recur (inc col) more))
                               (recur (newline! sb i) more))
             (= d :softline) (if (= m :flat)
                               (recur col more)
                               (recur (newline! sb i) more))
             (= d :hardline) (recur (newline! sb i) more)
             :else
             (case (directive d)
               :nest     (recur col (conj more [(+ i (second d)) m (nth d 2)]))
               :group    (if (and (= m :break)
                                  (not (fits? (- width col) (conj more [i :flat (second d)]))))
                           (recur col (conj more [i :break (second d)]))
                           (recur col (conj more [i :flat (second d)])))
               :if-break (recur col (conj more [i m (if (= m :break) (nth d 1) (nth d 2))]))
               (recur col (push-all more i m d)))))))
     (->> (str/split-lines (str sb))
          (map str/trimr)
          (str/join "\n")))))

;;; ------------------------------------------------ Helpers ------------------------------------------------------

(defn join
  "Concatenate `docs` with `sep` between each."
  [sep docs]
  (vec (interpose sep docs)))

(defn lines
  "A doc for several lines of text, joined with hard line breaks (so they indent with the surrounding code)."
  [text-lines]
  (join :hardline (vec text-lines)))

(defn text-block
  "Split a (possibly multi-line) string into a doc of hard-broken lines."
  [s]
  (lines (str/split s #"\n" -1)))

(defn block
  "A `{ ... }` block of statements."
  [stmts]
  (if (empty? stmts)
    "{}"
    ["{" [:nest 2 [:hardline (join :hardline stmts)]] :hardline "}"]))

(defn- item-parts
  "Normalize a bracket item. Items are either plain docs or maps of {:doc d, :lead [comment-strings], :trail str}."
  [item]
  (if (map? item) item {:doc item}))

(defn bracket
  "A comma-separated list between `open` and `close` that breaks one-item-per-line when it doesn't fit.
  `pad?` puts spaces inside the brackets when flat (for `{ a: 1 }`)."
  ([open items close] (bracket open items close false))
  ([open items close pad?]
   (if (empty? items)
     (str open close)
     (let [items   (mapv item-parts items)
           force?  (some #(or (seq (:lead %)) (:trail %)) items)
           n       (count items)
           body    (vec (for [[idx {:keys [doc lead trail]}] (map-indexed vector items)
                              :let [last? (= idx (dec n))]]
                          [(when (seq lead) [(join :hardline lead) :hardline])
                           doc
                           (if last? [:if-break "," ""] ",")
                           (when trail [" " trail])
                           (when-not last? (if trail :hardline :line))]))
           edge    (if pad? :line :softline)
           inner   [open [:nest 2 [edge body]] (if force? :hardline edge) close]]
       [:group inner]))))

(defn has-hardline?
  "Does `doc` contain a hard line break anywhere (i.e. can it never be laid out on one line)?"
  [doc]
  (cond
    (= doc :hardline) true
    (string? doc)     (str/includes? doc "\n")
    (vector? doc)     (boolean (some has-hardline? (if (directive doc) (rest doc) doc)))
    :else             false))

(defn flat-string
  "Render `doc` on a single line (used for measuring and for embedding expressions inside SQL text)."
  [doc]
  (render doc 100000))
