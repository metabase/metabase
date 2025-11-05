(ns metabase.lib.parse
  "Code for parsing parameters in raw SQL strings."
  (:refer-clojure :exclude [some empty? #?(:clj for)])
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [some empty? #?(:clj for)]]))

(defn- combine-adjacent-strings
  "Returns any adjacent strings in coll combined together"
  [coll]
  (apply concat
         (for [run (partition-by string? coll)]
           (if (string? (first run))
             [(apply str run)]
             run))))

(defn- find-token
  "Returns a vector of [index match] for string or regex pattern found in s"
  [s pattern]
  (if (string? pattern)
    (when-let [index (str/index-of s pattern)]
      [index pattern])
    #?(:clj (let [m (re-matcher pattern s)]
              (when (.find m)
                [(.start m) (subs s (.start m) (.end m))]))
       :cljs (when-let [m (.exec pattern s)]
               [(.-index m) (aget m 0)]))))

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
   ["}}" :param-end]
   ["'" :single-quote]])

(def ^:private sql-token-patterns
  (concat
   [["/*" :block-comment-begin]
    ["*/" :block-comment-end]
    ["--" :line-comment-begin]
    ["\n" :newline]]
   param-token-patterns))

(defn- tokenize [s handle-sql-comments]
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

(defn- maybe-throw-error [error-type msg]
  (if error-type
    (throw (ex-info msg
                    {:type error-type}))
    []))

(defn- param [{:keys [parse-error-type]} parsed]
  (let [[k & more] (combine-adjacent-strings parsed)]
    (cond
      (or (seq more)
          (not (string? k)))
      (maybe-throw-error parse-error-type
                         (tru "Invalid '''{{...}}''' clause: expected a param name"))

      (empty? (str/trim k))
      (maybe-throw-error parse-error-type (tru "'''{{...}}''' clauses cannot be empty."))

      :else [{:type :metabase.lib.parse/param, :name k}])))

(defn- optional [{:keys [parse-error-type]} parsed]
  (if-not (some #(and (map? %) (#{::param ::function-param} (:type %)))
                parsed)
    (maybe-throw-error parse-error-type
                       (tru "[[...]] clauses must contain at least one '''{{...}}''' clause."))
    [{:type ::optional
      :contents (combine-adjacent-strings parsed)}]))

(defn- parse-tokens*
  [opts tokens optional-level param-level in-string? comment-mode]
  (loop [acc [],
         [string-or-token & more] tokens
         in-string? in-string?]
    (cond
      (nil? string-or-token)
      (if (or (pos? optional-level) (pos? param-level))
        (throw (ex-info (tru "Invalid query: found ''[['' or '''{{''' with no matching '']]'' or ''}}''")
                        {:type (:parse-error-type opts)}))
        [acc nil])

      (string? string-or-token)
      (recur (conj acc string-or-token) more in-string?)

      :else
      (let [{:keys [text token]} string-or-token]
        (case token
          :optional-begin
          (if comment-mode
            (recur (conj acc text) more in-string?)
            (let [[parsed more] (try (let [[parsed more] (parse-tokens* opts more (inc optional-level) param-level in-string? comment-mode)]
                                       [(optional opts parsed) more])
                                     (catch #?(:clj clojure.lang.ExceptionInfo
                                               :cljs ExceptionInfo) e
                                       (if (and in-string? (= (:parse-error-type opts) (:type (ex-data e))))
                                         [[text] more]
                                         (throw e))))]
              (recur (apply conj acc parsed) more in-string?)))

          :param-begin
          (if comment-mode
            (recur (conj acc text) more in-string?)
            (let [[parsed more] (try (let [[parsed more] (parse-tokens* opts more optional-level (inc param-level) in-string? comment-mode)]
                                       [(param opts parsed) more])
                                     (catch #?(:clj clojure.lang.ExceptionInfo
                                               :cljs ExceptionInfo) e
                                       (if (and in-string? (= (:parse-error-type opts) (:type (ex-data e))))
                                         [[text] more]
                                         (throw e))))]
              (recur (apply conj acc parsed) more in-string?)))

          (:line-comment-begin :block-comment-begin)
          (if (or comment-mode (pos? optional-level) in-string?)
            (recur (conj acc text) more in-string?)
            (let [[parsed more] (parse-tokens* opts more optional-level param-level in-string? token)]
              (recur (into acc (cons text parsed)) more in-string?)))

          :block-comment-end
          (if (= comment-mode :block-comment-begin)
            [(conj acc text) more]
            (recur (conj acc text) more in-string?))

          :newline
          (if (= comment-mode :line-comment-begin)
            [(conj acc text) more]
            (recur (conj acc text) more in-string?))

          :optional-end
          (if (pos? optional-level)
            [acc more]
            (recur (conj acc text) more in-string?))

          :param-end
          (if (pos? param-level)
            [acc more]
            (recur (conj acc text) more in-string?))

          :single-quote
          (recur (conj acc text) more (not in-string?)))))))

(defn parse
  "Attempts to parse parameters in string `s`. Parses any optional clauses or parameters found, and returns a sequence
  of non-parameter string fragments (possibly) interposed with maps representing params, function params, or
  optionals.

   If `handle-sql-comments` is true (default) then we make a best effort to ignore params in SQL comments."
  ([opts s]
   (parse opts s true))

  ([opts s handle-sql-comments]
   (let [tokenized (tokenize s handle-sql-comments)]
     (if (= [s] tokenized)
       [s]
       (do
         (log/tracef "Tokenized native query ->\n%s" (u/pprint-to-str tokenized))
         (u/prog1 (combine-adjacent-strings (first (parse-tokens* opts tokenized 0 0 false nil)))
           (log/tracef "Parsed native query ->\n%s" (u/pprint-to-str <>))))))))
