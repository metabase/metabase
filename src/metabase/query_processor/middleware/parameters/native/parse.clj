(ns metabase.query-processor.middleware.parameters.native.parse
  (:require [clojure.string :as str]
            [metabase.query-processor.middleware.parameters.native.interface :as i]
            [schema.core :as s])
  (:import [metabase.query_processor.middleware.parameters.native.interface Optional Param]))

(def ^:private Token (s/cond-pre s/Str (s/enum :optional-begin :param-begin :end)))

(s/defn ^:private tokenize :- [Token]
  [s :- s/Str]
  (reduce
   (fn [strs [regex token]]
     (mapcat
      (fn [s]
        (if-not (string? s)
          [s]
          (interpose token (str/split s regex))))
      strs))
   [s #_(format " %s " s)]
   [[#"\[\[" :optional-begin]
    [#"\]\]" :end]
    [#"\{\{" :param-begin]
    [#"\}\}" :end]]))

(defn- param [& [k & more]]
  (when (or (seq more)
            (not (string? k)))
    (throw (Exception. "Invalid {{...}} clause: expected a param name")))
  (let [k (str/trim k)]
    (when (empty? k)
      (throw (Exception. "{{...}} clauses cannot be empty.")))
    (i/->Param k)))

(defn- optional [& parsed]
  (when-not (some i/Param? parsed)
    (throw (Exception. "[[...]] clauses must contain at least one {{...}} clause.")))
  (i/->Optional parsed))

(def ^:private ParsedToken (s/cond-pre s/Str Param Optional))

(declare parse-tokens)

(s/defn ^:private parse-tokens :- [(s/one [ParsedToken] "parsed tokens") (s/one [Token] "remaining tokens")]
  [tokens :- [Token]]
  (loop [acc [], [token & more] tokens]
    (condp = token
      nil
      [acc nil]

      :optional-begin
      (let [[parsed more] (parse-tokens more)]
        (recur (conj acc (apply optional parsed)) more))

      :param-begin
      (let [[parsed more] (parse-tokens more)]
        (recur (conj acc (apply param parsed)) more))

      :end
      [acc more]

      (recur (conj acc token) more))))

(s/defn parse :- [(s/cond-pre s/Str Param Optional)]
  "Attempts to parse SQL string `s`. Parses any optional clauses or parameters found, and returns a sequence of SQL
  query fragments Strings (possibly) interposed with `Param` or `Optional` instances."
  [s :- s/Str]
  (-> s tokenize parse-tokens first))
