(ns metabase.driver.common.parameters.parse
  (:require
   [clojure.string :as str]
   [metabase.driver.common.parameters :as params]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [schema.core :as s])
  (:import
   (metabase.driver.common.parameters Optional Param)))

;; tokenizing

(def ^:private StringOrToken  (s/cond-pre s/Str (s/enum :optional-begin :param-begin :optional-end :param-end)))

(defmulti ^:private read-token
  "Return vector of [index token-or-text remaining-text] from s."
  (fn [_ pattern _] (type pattern)))

(defmethod read-token java.lang.String
  [s pattern token]
  (when-let [index (str/index-of s pattern)]
    [index token (subs s (+ index (count pattern)))]))

(defmethod read-token java.util.regex.Pattern
  [s re token]
  (when-let [match (re-find re s)]
    (let [text   (if (vector? match)
                   (first match)
                   match)
          index  (str/index-of s text)
          after  (subs s (+ index (count text)))
          ;; comments are ignored and treated as text in the tokenizer
          token-or-text (if (= :comment token) text token)]
      [index token-or-text after])))

(def ^:private token-patterns
  "A sequence of pairs of [token-name pattern]"
  [[:comment        #"--.*(\n|$)"]
   [:comment        #"(?s)/\*.*\*/"]
   [:optional-begin "[["]
   [:optional-end   "]]"]
    ;; param-begin should only match the last two opening brackets in a sequence of > 2, e.g.
    ;; [{$match: {{{x}}, field: 1}}] should parse to ["[$match: {" (param "x") ", field: 1}}]"]
   [:param-begin    #"(?s)\{\{(?!\{)"]
   [:param-end      "}}"]])

(defn- find-token
  "Returns vector of first token found in s and remaining text, if any match is found"
  [s]
  (first
   (sort-by first
            (for [[token pattern] token-patterns
                  :let [[index token after] (read-token s pattern token)]
                  :when token]
              [index token after]))))

(defn- tokenize
  "Returns a sequence of strings or keyword tokens from s for further parsing."
  [s]
  (loop [tokens []
         s      s]
    (if-let [[index token after] (find-token s)]
      (recur (conj tokens (subs s 0 index) token) after)
      (conj tokens s))))

;; parsing

(def ^:private ParsedToken (s/cond-pre s/Str Param Optional))

(defn- param [& [k & more]]
  (when (or (seq more)
            (not (string? k)))
    (throw (ex-info (tru "Invalid '{{...}}' clause: expected a param name")
             {:type qp.error-type/invalid-query})))
  (let [k (str/trim k)]
    (when (empty? k)
      (throw (ex-info (tru "'{{...}}' clauses cannot be empty.")
               {:type qp.error-type/invalid-query})))
    (params/->Param k)))

(defn- optional [& parsed]
  (when-not (some params/Param? parsed)
    (throw (ex-info (tru "'[[...]]' clauses must contain at least one '{{...}}' clause.")
             {:type qp.error-type/invalid-query})))
  (params/->Optional parsed))

(s/defn ^:private parse-tokens* :- [(s/one [ParsedToken] "parsed tokens") (s/one [StringOrToken] "remaining tokens")]
  [tokens :- [StringOrToken], optional-level :- s/Int, param-level :- s/Int]
  (loop [acc [], [token & more] tokens]
    (condp = token
      nil
      (if (or (pos? optional-level) (pos? param-level))
        (throw (ex-info (tru "Invalid query: found '[[' or '{{' with no matching ']]' or '}}'")
                        {:type qp.error-type/invalid-query}))
        [acc nil])

      :optional-begin
      (let [[parsed more] (parse-tokens* more (inc optional-level) param-level)]
        (recur (conj acc (apply optional parsed)) more))

      :param-begin
      (let [[parsed more] (parse-tokens* more optional-level (inc param-level))]
        (recur (conj acc (apply param parsed)) more))

      :optional-end
      (if (pos? optional-level)
        [acc more]
        (recur (conj acc "]]") more))

      :param-end
      (if (pos? param-level)
        [acc more]
        (recur (conj acc "}}") more))

      (recur (conj acc token) more))))

(s/defn ^:private parse-tokens :- [ParsedToken]
  [tokens :- [StringOrToken]]
  (let [parsed (first (parse-tokens* tokens 0 0))]
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
