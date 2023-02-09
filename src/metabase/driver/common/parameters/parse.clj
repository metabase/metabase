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

(def ^:private StringOrToken  (s/cond-pre s/Str {:token (s/enum :optional-begin :param-begin :optional-end :param-end :comment)
                                                 :text  s/Str}))

(def ^:private ParsedToken (s/cond-pre s/Str Param Optional))

(defn- find-token
  "Returns a vector of [index match] for string or regex pattern found in s"
  [s pattern]
  (if (string? pattern)
    (when-let [index (str/index-of s pattern)]
      [index pattern])
    (let [m (re-matcher pattern s)]
      (when (.find m)
        [(.start m) (subs s (.start m) (.end m))]))))

(defn- tokenize-one [s pattern token]
  (loop [acc [], s s]
    (if (empty? s)
      acc
      (if-let [[index text] (find-token s pattern)]
        (recur (conj acc (subs s 0 index) {:text text :token token})
               (subs s (+ index (count text))))
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
   [[#"(?s)/\*.*\*/" :comment]
    [#"--.*?(\n|$)" :comment]
    ["[[" :optional-begin]
    ["]]" :optional-end]
    ;; param-begin should only match the last two opening brackets in a sequence of > 2, e.g.
    ;; [{$match: {{{x}}, field: 1}}] should parse to ["[$match: {" (param "x") ", field: 1}}]"]
    [#"(?s)\{\{(?!\{)" :param-begin]
    ["}}" :param-end]]))

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
  (loop [acc [], [string-or-token & more] tokens]
    (cond
      (nil? string-or-token)
      (if (or (pos? optional-level) (pos? param-level))
        (throw (ex-info (tru "Invalid query: found '[[' or '{{' with no matching ']]' or '}}'")
                        {:type qp.error-type/invalid-query}))
        [acc nil])

      (string? string-or-token)
      (recur (conj acc string-or-token) more)

      :else
      (let [{:keys [text token]} string-or-token]
        (condp = token
          :optional-begin
          (let [[parsed more] (parse-tokens* more (inc optional-level) param-level)]
            (recur (conj acc (apply optional parsed)) more))

          :param-begin
          (let [[parsed more] (parse-tokens* more optional-level (inc param-level))]
            (recur (conj acc (apply param parsed)) more))

          :optional-end
          (if (pos? optional-level)
            [acc more]
            (recur (conj acc text) more))

          :param-end
          (if (pos? param-level)
            [acc more]
            (recur (conj acc text) more))

          (recur (conj acc text) more))))))

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
