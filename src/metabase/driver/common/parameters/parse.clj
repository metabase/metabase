(ns metabase.driver.common.parameters.parse
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.driver.common.parameters :as i]
            [metabase.query-processor.error-type :as error-type]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s])
  (:import [metabase.driver.common.parameters Optional Param]))

(def ^:private StringOrToken  (s/cond-pre s/Str (s/enum :optional-begin :param-begin :optional-end :param-end)))

(def ^:private ParsedToken (s/cond-pre s/Str Param Optional))

(defn- split-on-token-string
  "Split string `s` once when substring `token-str` is encountered; replace `token-str` with `token` keyword instead.

    (split-on-token \"ABxCxD\" \"x\" :x) ;; -> [\"AB\" :x \"CxD\"]"
  [^String s token-str token]
  (when-let [index (str/index-of s token-str)]
    (let [before (.substring s 0 index)
          after  (.substring s (+ index (count token-str)) (count s))]
      [before token after])))

(defn- split-on-token-pattern
  "Like `split-on-token-string`, but splits on a regular expression instead, replacing the matched group with `token`.
  The pattern match an entire query, and return 3 groups — everything before the match; the match itself; and
  everything after the match."
  [s re token]
  (when-let [[_ before _ after] (re-matches re s)]
    [before token after]))

(defn- split-on-token
  [s token-str token]
  ((if (string? token-str)
     split-on-token-string
     split-on-token-pattern) s token-str token))

(defn- tokenize-one [s token-str token]
  (loop [acc [], s s]
    (if (empty? s)
      acc
      (if-let [[before token after] (split-on-token s token-str token)]
        (recur (into acc [before token]) after)
        (conj acc s)))))

(s/defn ^:private tokenize :- [StringOrToken]
  [s :- s/Str]
  (reduce
   (fn [strs [token-str token]]
     (filter
      (some-fn keyword? seq)
      (mapcat
       (fn [s]
         (if-not (string? s)
           [s]
           (tokenize-one s token-str token)))
       strs)))
   [s]
   [["[[" :optional-begin]
    ["]]" :optional-end]
    ;; param-begin should only match the last two opening brackets in a sequence of > 2, e.g.
    ;; [{$match: {{{x}}, field: 1}}] should parse to ["[$match: {" (param "x") ", field: 1}}]"]
    [#"(?s)(.*?)(\{\{(?!\{))(.*)" :param-begin]
    ["}}" :param-end]]))

(defn- param [& [k & more]]
  (when (or (seq more)
            (not (string? k)))
    (throw (ex-info (tru "Invalid '{{...}}' clause: expected a param name")
             {:type error-type/invalid-query})))
  (let [k (str/trim k)]
    (when (empty? k)
      (throw (ex-info (tru "'{{...}}' clauses cannot be empty.")
               {:type error-type/invalid-query})))
    (i/->Param k)))

(defn- optional [& parsed]
  (when-not (some i/Param? parsed)
    (throw (ex-info (tru "'[[...]]' clauses must contain at least one '{{...}}' clause.")
             {:type error-type/invalid-query})))
  (i/->Optional parsed))

(s/defn ^:private parse-tokens* :- [(s/one [ParsedToken] "parsed tokens") (s/one [StringOrToken] "remaining tokens")]
  [tokens :- [StringOrToken], level :- s/Int]
  (loop [acc [], [token & more] tokens]
    (condp = token
      nil
      (if (pos? level)
        (throw (ex-info (tru "Invalid query: found '[[' or '{{' with no matching ']]' or '}}'")
                 {:type error-type/invalid-query}))
        [acc nil])

      :optional-begin
      (let [[parsed more] (parse-tokens* more (inc level))]
        (recur (conj acc (apply optional parsed)) more))

      :param-begin
      (let [[parsed more] (parse-tokens* more (inc level))]
        (recur (conj acc (apply param parsed)) more))

      :optional-end
      (if (pos? level)
        [acc more]
        [(conj acc "]]" more)])

      :param-end
      (if (pos? level)
        [acc more]
        [(conj acc "}}") more])

      (recur (conj acc token) more))))

(s/defn ^:private parse-tokens :- [ParsedToken]
  [tokens :- [StringOrToken]]
  (let [[parsed remaining] (parse-tokens* tokens 0)
        parsed             (concat parsed (when (seq remaining)
                                            (parse-tokens remaining)))]
    ;; now loop over everything in `parsed`, and if we see 2 strings next to each other put them back together
    ;; e.g. [:token "x" "}}"] -> [:token "x}}"]
    (loop [acc [], last (first parsed), [x & more] (rest parsed)]
      (cond
        (not x)                          (conj acc last)
        (and (string? last) (string? x)) (recur acc (str last x) more)
        :else                            (recur (conj acc last) x more)))))

(s/defn parse :- [(s/cond-pre s/Str Param Optional)]
  "Attempts to parse parameters in string `s`. Parses any optional clauses or parameters found, and returns a sequence
   of non-parameter string fragments (possibly) interposed with `Param` or `Optional` instances."
  [s :- s/Str]
  (let [tokenized (tokenize s)]
    (if (= [s] tokenized)
      [s]
      (do
        (log/tracef "Tokenized native query ->\n%s" (u/pprint-to-str tokenized))
        (u/prog1 (parse-tokens tokenized)
          (log/tracef "Parsed native query ->\n%s" (u/pprint-to-str <>)))))))
