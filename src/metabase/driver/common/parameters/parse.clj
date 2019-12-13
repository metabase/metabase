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
    ["]]" :optional-end]
    ["{{" :param-begin]
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
  (let [[parsed remaining] (parse-tokens* tokens 0)]
    (concat parsed (when (seq remaining)
                     (parse-tokens remaining)))))

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
