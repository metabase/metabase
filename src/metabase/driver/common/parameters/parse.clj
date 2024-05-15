(ns metabase.driver.common.parameters.parse
  (:require
   [clojure.string :as str]
   [metabase.driver.common.parameters :as params]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (metabase.driver.common.parameters Optional Param)))

(set! *warn-on-reflection* true)

(def ^:private StringOrToken  [:or
                               :string
                               [:map
                                [:token :keyword]
                                [:text  :string]]])

(def ^:private ParsedToken
  [:or
   :string
   (lib.schema.common/instance-of-class Param)
   (lib.schema.common/instance-of-class Optional)])

(defn- combine-adjacent-strings
  "Returns any adjacent strings in coll combined together"
  [coll]
  (apply concat
         (for [subseq (partition-by string? coll)]
           (if (string? (first subseq))
             [(apply str subseq)]
             subseq))))

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

(def ^:private param-token-patterns
  [["[[" :optional-begin]
   ["]]" :optional-end]
    ;; param-begin should only match the last two opening brackets in a sequence of > 2, e.g.
    ;; [{$match: {{{x}}, field: 1}}] should parse to ["[$match: {" (param "x") ", field: 1}}]"]
   [#"(?s)\{\{(?!\{)" :param-begin]
   ["}}" :param-end]])

(def ^:private sql-token-patterns
  (concat
   [["/*" :block-comment-begin]
    ["*/" :block-comment-end]
    ["--" :line-comment-begin]
    ["\n" :newline]]
   param-token-patterns))

(mu/defn ^:private tokenize :- [:sequential StringOrToken]
  [s                   :- :string
   handle-sql-comments :- :boolean]
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
   (if handle-sql-comments
     sql-token-patterns
     param-token-patterns)))

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
  (params/->Optional (combine-adjacent-strings parsed)))

(mu/defn ^:private parse-tokens* :- [:tuple
                                     [:sequential ParsedToken]
                                     [:maybe [:sequential StringOrToken]]]
  [tokens         :- [:sequential StringOrToken]
   optional-level :- :int
   param-level    :- :int
   comment-mode   :- [:maybe [:enum :block-comment-begin :line-comment-begin]]]
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
        (case token
          :optional-begin
          (if comment-mode
            (recur (conj acc text) more)
            (let [[parsed more] (parse-tokens* more (inc optional-level) param-level comment-mode)]
              (recur (conj acc (apply optional parsed)) more)))

          :param-begin
          (if comment-mode
            (recur (conj acc text) more)
            (let [[parsed more] (parse-tokens* more optional-level (inc param-level) comment-mode)]
              (recur (conj acc (apply param parsed)) more)))

          (:line-comment-begin :block-comment-begin)
          (if (or comment-mode (pos? optional-level))
            (recur (conj acc text) more)
            (let [[parsed more] (parse-tokens* more optional-level param-level token)]
              (recur (into acc (cons text parsed)) more)))

          :block-comment-end
          (if (= comment-mode :block-comment-begin)
            [(conj acc text) more]
            (recur (conj acc text) more))

          :newline
          (if (= comment-mode :line-comment-begin)
            [(conj acc text) more]
            (recur (conj acc text) more))

          :optional-end
          (if (pos? optional-level)
            [acc more]
            (recur (conj acc text) more))

          :param-end
          (if (pos? param-level)
            [acc more]
            (recur (conj acc text) more)))))))

(mu/defn parse :- [:sequential ParsedToken]
  "Attempts to parse parameters in string `s`. Parses any optional clauses or parameters found, and returns a sequence
   of non-parameter string fragments (possibly) interposed with `Param` or `Optional` instances.

   If `handle-sql-comments` is true (default) then we make a best effort to ignore params in SQL comments."
  ([s :- :string]
   (parse s true))

  ([s                   :- :string
    handle-sql-comments :- :boolean]
   (let [tokenized (tokenize s handle-sql-comments)]
     (if (= [s] tokenized)
       [s]
       (do
         (log/tracef "Tokenized native query ->\n%s" (u/pprint-to-str tokenized))
         (u/prog1 (combine-adjacent-strings (first (parse-tokens* tokenized 0 0 nil)))
           (log/tracef "Parsed native query ->\n%s" (u/pprint-to-str <>))))))))
