(ns metabase.sql-parsing.values
  "JVM-side stripping of huge VALUES clauses before SQL reaches the parser. Multi-megabyte VALUES
  lists (bulk INSERTs, inline lookup tables) carry no reference information but would blow through
  the parser's token budget; replacing them with a single NULL row preserves the query structure
  and the first tuple's column count."
  (:require
   [clojure.string :as str]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private ^:const values-strip-threshold
  "Only strip VALUES clauses with more than this many tuples."
  100)

(def ^:private values-keyword-pattern
  "Pattern to find VALUES keyword followed by opening paren."
  (re-pattern "(?i)\\bVALUES\\s*\\("))

(defn- skip-whitespace
  "Return the first non-whitespace position at or after `pos`."
  ^long [^String sql ^long pos ^long n]
  (loop [p pos]
    (if (and (< p n) (Character/isWhitespace (.charAt sql p)))
      (recur (inc p))
      p)))

(defn- skip-balanced-parens
  "Starting at an opening `(`, advance past the matching `)`.
   Handles nested parens and SQL string literals (single and double quoted, with doubled-quote escaping).
   Returns the position immediately after the closing `)`."
  ^long [^String sql ^long pos ^long n]
  (loop [pos pos, depth (int 0), in-str false, str-ch \space]
    (if (>= pos n)
      pos
      (let [ch (.charAt sql pos)]
        (cond
          ;; Inside a string literal — look for the closing quote
          in-str
          (if (= ch str-ch)
            (if (and (< (inc pos) n) (= (.charAt sql (inc pos)) str-ch))
              (recur (+ pos 2) depth true str-ch) ; escaped (doubled) quote
              (recur (inc pos) depth false str-ch))
            (recur (inc pos) depth true str-ch))

          (or (= ch \') (= ch \"))  (recur (inc pos) depth true ch)
          (= ch \()                 (recur (inc pos) (inc depth) false str-ch)
          (= ch \))                 (if (= depth 1)
                                      (inc pos) ; done
                                      (recur (inc pos) (dec depth) false str-ch))
          :else                     (recur (inc pos) depth false str-ch))))))

(defn- count-top-level-commas
  "Count top-level comma-separated items inside a tuple's content string.
   `(1, 'a', 3)` → inner content `1, 'a', 3` → 3 items."
  ^long [^String content]
  (let [n (.length content)]
    (loop [i 0, depth (int 0), in-str false, str-ch \space, items (int 1)]
      (if (>= i n)
        items
        (let [ch (.charAt content i)]
          (cond
            in-str                      (recur (inc i) depth (not= ch str-ch) str-ch items)
            (or (= ch \') (= ch \"))    (recur (inc i) depth true ch items)
            (= ch \()                   (recur (inc i) (inc depth) false str-ch items)
            (= ch \))                   (recur (inc i) (dec depth) false str-ch items)
            (and (= ch \,) (= depth 0)) (recur (inc i) depth false str-ch (inc items))
            :else                       (recur (inc i) depth false str-ch items)))))))

(defn- count-and-skip-tuples
  "Starting after the first tuple, count how many more `, (...)` tuples follow.
   Returns [total-tuple-count position-after-last-tuple]."
  [^String sql ^long pos ^long n]
  (loop [pos pos, count (int 1)]
    (let [pos (skip-whitespace sql pos n)]
      (if (or (>= pos n) (not= (.charAt sql pos) \,))
        [count pos]
        (let [pos (skip-whitespace sql (inc pos) n)]
          (if (or (>= pos n) (not= (.charAt sql pos) \())
            [count pos]
            (recur (skip-balanced-parens sql pos n) (inc count))))))))

(defn- make-null-placeholder
  "Build `VALUES (NULL, NULL, ...)` preserving the original keyword casing."
  ^String [^String original-keyword ^long col-count]
  (let [nulls (str/join ", " (repeat col-count "NULL"))]
    (str original-keyword " (" nulls ")")))

(defn- extract-values-keyword
  "Extract just the VALUES keyword text from a regex match like `VALUES (`."
  ^String [^String sql ^long match-start ^long match-end]
  (-> (.substring sql match-start match-end)
      str/trimr
      (str/replace #"\($" "")
      str/trimr))

(defn- strip-large-values*
  "Walk through SQL, replacing any VALUES clause with more than `values-strip-threshold`
   tuples with a single-row NULL placeholder. Preserves column count from the first tuple."
  ^String [^String sql]
  (let [matcher (re-matcher values-keyword-pattern sql)
        n       (int (.length sql))]
    (if-not (.find matcher)
      sql
      (let [_ (.reset matcher)
            sb (StringBuilder.)]
        (loop [i (int 0)]
          (if-not (.find matcher i)
            (-> sb (.append sql i n) .toString)
            (let [match-start   (.start matcher)
                  match-end     (.end matcher)
                  _             (.append sb sql (int i) (int match-start))
                  ;; Parse the first tuple to learn its column count
                  paren-start   (dec (int match-end))
                  first-end     (skip-balanced-parens sql paren-start n)
                  first-inner   (when (> first-end (inc paren-start))
                                  (.substring sql (inc paren-start) (dec (int first-end))))
                  ;; Scan remaining tuples
                  [tuple-count end-pos] (count-and-skip-tuples sql first-end n)]
              (if (and (> (int tuple-count) values-strip-threshold) first-inner)
                (do (.append sb (make-null-placeholder
                                 (extract-values-keyword sql match-start match-end)
                                 (count-top-level-commas first-inner)))
                    (recur (int end-pos)))
                (do (.append sb sql (int match-start) (int end-pos))
                    (recur (int end-pos)))))))))))

(defn strip-large-values
  "Replace large VALUES clauses with a single-row NULL placeholder.

   Preserves the column count from the first tuple and all surrounding SQL structure.
   Only triggers when a VALUES clause has more than `values-strip-threshold` tuples.

   On any error, returns the original SQL unchanged so parsing can proceed normally."
  ^String [^String sql]
  (try
    (strip-large-values* sql)
    (catch Exception e
      (log/warn e "Error stripping VALUES clauses, passing SQL through unchanged")
      sql)))
