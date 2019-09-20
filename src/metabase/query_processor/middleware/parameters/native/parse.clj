(ns metabase.query-processor.middleware.parameters.native.parse
  (:require [clojure.string :as str]
            [metabase.query-processor.middleware.parameters.native.interface :as i]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s])
  (:import [metabase.query_processor.middleware.parameters.native.interface Optional Param]))

(def ^:private StringOrToken  (s/cond-pre s/Str (s/enum :optional-begin :param-begin :end)))

(defn- split-on-token [^String s token-str token]
  (when-let [index (str/index-of s token-str)]
    (let [before (.substring s 0 index)
          after  (.substring s (+ index (count token-str)) (count s))]
      [before token after])))

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
    ["]]" :end]
    ["{{" :param-begin]
    ["}}" :end]]))

(defn- param [& [k & more]]
  (when (or (seq more)
            (not (string? k)))
    (throw (Exception. (tru "Invalid '{{...}}' clause: expected a param name"))))
  (let [k (str/trim k)]
    (when (empty? k)
      (throw (Exception. (tru "'{{...}}' clauses cannot be empty."))))
    (i/->Param k)))

(defn- optional [& parsed]
  (when-not (some i/Param? parsed)
    (throw (Exception. (tru "'[[...]]' clauses must contain at least one '{{...}}' clause."))))
  (i/->Optional parsed))

(def ^:private ParsedToken (s/cond-pre s/Str Param Optional))

(declare parse-tokens)

(s/defn ^:private parse-tokens :- [(s/one [ParsedToken] "parsed tokens") (s/one [StringOrToken] "remaining tokens")]
  ([tokens :- [StringOrToken]]
   (parse-tokens tokens 0))

  ([tokens :- [StringOrToken], level]
   (loop [acc [], [token & more] tokens]
     (condp = token
       nil
       (if (pos? level)
         (throw
          (IllegalArgumentException. (tru "Invalid query: found '[[' or '{{' with no matching ']]' or '}}'")))
         [acc nil])

       :optional-begin
       (let [[parsed more] (parse-tokens more (inc level))]
         (recur (conj acc (apply optional parsed)) more))

       :param-begin
       (let [[parsed more] (parse-tokens more (inc level))]
         (recur (conj acc (apply param parsed)) more))

       :end
       (if (zero? level)
         (throw
          (IllegalArgumentException. (tru "Invalid query: found ']]' or '}}' with no matching '[[' or '{{'")))
         [acc more])

       (recur (conj acc token) more)))))

(s/defn parse :- [(s/cond-pre s/Str Param Optional)]
  "Attempts to parse SQL string `s`. Parses any optional clauses or parameters found, and returns a sequence of SQL
  query fragments Strings (possibly) interposed with `Param` or `Optional` instances."
  [s :- s/Str]
  (-> s tokenize parse-tokens first))
